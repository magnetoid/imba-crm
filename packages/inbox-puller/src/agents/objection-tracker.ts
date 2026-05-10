// objection-tracker (Phase 10.6) — nightly sweep that scans inbound
// messages + call transcripts for the last 7d and tags any objections
// it finds against crm_objection_tags. Result lives on
// crm_leads.objections jsonb as `[{ slug, label, evidence, source_id, source_kind, captured_at }]`.
//
// Input:  { lead_id?, days? }   — without lead_id, sweeps all active leads.

import type { AgentContext, JobRow } from './runtime.js'
import { supabase } from '../supabase.js'
import { callAIJSON } from '../ai.js'

interface ObjectionTag { slug: string; label: string; description: string | null }
interface ObjectionEntry {
  slug: string
  label: string
  evidence: string                  // 1 line quote
  source_kind: 'inbox_message' | 'call_transcript'
  source_id: string
  captured_at: string
}

const DEFAULT_DAYS = 7

export async function runObjectionTracker(_ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  const days = (job.input?.days as number | undefined) ?? DEFAULT_DAYS
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  // Pre-load the taxonomy.
  const { data: tags } = await supabase
    .from('crm_objection_tags')
    .select('slug, label, description')
  const tagList = (tags ?? []) as ObjectionTag[]
  if (tagList.length === 0) return { skipped: true, reason: 'no objection_tags configured' }

  let leadIds: string[]
  if (job.lead_id) {
    leadIds = [job.lead_id]
  } else {
    const { data } = await supabase.from('crm_leads')
      .select('id').not('stage', 'in', '(won,lost)').limit(500)
    leadIds = ((data ?? []) as Array<{ id: string }>).map(r => r.id)
  }

  let scanned = 0
  let tagged = 0
  for (const id of leadIds) {
    const { data: msgs } = await supabase
      .from('crm_inbox_messages')
      .select('id, body, received_at')
      .eq('lead_id', id)
      .eq('direction', 'inbound')
      .gte('received_at', since)
      .order('received_at', { ascending: false })
      .limit(20)
    const { data: calls } = await supabase
      .from('crm_activities')
      .select('id, transcript_text, body, created_at')
      .eq('lead_id', id)
      .eq('type', 'meeting')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10)

    const items: Array<{ kind: 'inbox_message' | 'call_transcript'; id: string; text: string; at: string }> = []
    for (const m of (msgs ?? []) as Array<{ id: string; body: string | null; received_at: string }>) {
      if (m.body) items.push({ kind: 'inbox_message', id: m.id, text: m.body.slice(0, 4000), at: m.received_at })
    }
    for (const c of (calls ?? []) as Array<{ id: string; transcript_text: string | null; body: string | null; created_at: string }>) {
      const t = c.transcript_text || c.body
      if (t) items.push({ kind: 'call_transcript', id: c.id, text: t.slice(0, 8000), at: c.created_at })
    }
    if (items.length === 0) continue
    scanned += items.length

    // Ask the AI for a tag list per item.
    const prompt = `You are a sales coach. The following items are inbound messages or call transcripts from a B2B sales conversation. For EACH item, identify which (if any) objections from the taxonomy below the prospect raised. Quote the exact phrase as evidence.

Taxonomy:
${tagList.map(t => `- ${t.slug}: ${t.label} — ${t.description ?? ''}`).join('\n')}

Items:
${items.map((it, i) => `[${i}] (${it.kind}, ${it.at})\n${it.text}`).join('\n\n---\n\n')}

Return ONLY valid minified JSON:
{"items":[{"index":0,"objections":[{"slug":"<from-taxonomy>","evidence":"<exact quote>"}]}]}`

    const result = await callAIJSON<{ items?: Array<{ index: number; objections?: Array<{ slug: string; evidence: string }> }> }>({
      userPrompt: prompt,
      maxTokens: 1500,
    })
    if (!result?.items) continue

    const newEntries: ObjectionEntry[] = []
    for (const r of result.items) {
      const item = items[r.index]
      if (!item) continue
      for (const o of r.objections ?? []) {
        const tag = tagList.find(t => t.slug === o.slug)
        if (!tag) continue
        newEntries.push({
          slug: tag.slug,
          label: tag.label,
          evidence: o.evidence?.slice(0, 400) ?? '',
          source_kind: item.kind,
          source_id: item.id,
          captured_at: item.at,
        })
      }
    }
    if (newEntries.length === 0) continue

    // Merge into the lead — dedup by (slug, source_id).
    const { data: leadRow } = await supabase.from('crm_leads').select('objections').eq('id', id).maybeSingle()
    const existing = ((leadRow as { objections?: ObjectionEntry[] } | null)?.objections ?? [])
    const merged: ObjectionEntry[] = [...existing]
    for (const e of newEntries) {
      if (!merged.some(x => x.slug === e.slug && x.source_id === e.source_id)) {
        merged.push(e)
        tagged++
      }
    }
    if (merged.length > existing.length) {
      await supabase.from('crm_leads').update({ objections: merged.slice(-100) }).eq('id', id)
    }
  }

  return { scanned, tagged, days, leads: leadIds.length }
}
