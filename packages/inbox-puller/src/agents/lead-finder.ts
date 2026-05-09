// lead-finder agent
// Input:  { actor_id, actor_input, max_save?: 50 }
// Steps:
//   1. run-actor       — Apify actor produces dataset items
//   2. dedupe          — drop rows whose domain is already in crm_companies
//   3. save-leads      — insert crm_companies + crm_leads rows

import type { AgentContext, JobRow } from './runtime.js'
import { supabase, loadProviderCredential } from '../supabase.js'
import { runApifyActor } from '@imba/shared/integrations/apify'

interface ScrapedRow {
  email?: string
  name?: string
  fullName?: string
  firstName?: string
  lastName?: string
  company?: string
  companyName?: string
  domain?: string
  website?: string
  linkedinUrl?: string
  profileUrl?: string
  title?: string
  jobTitle?: string
}

function pickDomain(row: ScrapedRow): string | null {
  const candidate = row.domain || row.website || ''
  if (!candidate) return null
  try { return new URL(candidate).host.replace(/^www\./, '') } catch { return candidate.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '') || null }
}

function pickName(row: ScrapedRow): string | null {
  return row.name || row.fullName ||
    [row.firstName, row.lastName].filter(Boolean).join(' ') || null
}

export async function runLeadFinder(ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  const actorId    = (job.input.actor_id    as string)               ?? 'apify/web-scraper'
  const actorInput = (job.input.actor_input as Record<string, unknown>) ?? {}
  const maxSave    = Math.min(200, (job.input.max_save as number) ?? 50)

  // ── Step 1: run the Apify actor ─────────────────────────────────
  const items = await ctx.step('run-actor', { actor_id: actorId }, async () => {
    const cred = await loadProviderCredential('apify')
    if (!cred?.apiKey) throw new Error('apify provider credential not configured')
    const run = await runApifyActor<ScrapedRow>(cred, {
      actorId,
      input: actorInput,
      timeoutSeconds: 600,
      maxItems: maxSave * 2,
    })
    if (run.status !== 'SUCCEEDED') throw new Error(`apify run ${run.status}`)
    return run.items
  })

  // ── Step 2: dedupe by domain ────────────────────────────────────
  const fresh = await ctx.step('dedupe', { count_in: items.length }, async () => {
    const seen = new Set<string>()
    const out: ScrapedRow[] = []
    for (const row of items) {
      const domain = pickDomain(row)
      const key = (row.email || domain || row.linkedinUrl || row.profileUrl || '').toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(row)
      if (out.length >= maxSave) break
    }
    if (out.length === 0) return []
    // Cross-check against existing companies — drop where domain already known.
    const domains = out.map(pickDomain).filter(Boolean) as string[]
    if (domains.length === 0) return out
    const { data: existing } = await supabase
      .from('crm_companies')
      .select('domain')
      .in('domain', domains)
    const knownDomains = new Set(((existing as Array<{ domain: string }> | null) ?? []).map(r => r.domain.toLowerCase()))
    return out.filter(r => {
      const d = pickDomain(r)
      return !d || !knownDomains.has(d.toLowerCase())
    })
  })

  // ── Step 3: save to crm_companies + crm_leads ───────────────────
  const saved = await ctx.step('save-leads', { count_to_save: (fresh as ScrapedRow[]).length }, async () => {
    const created = { companies: 0, leads: 0 }
    for (const row of fresh as ScrapedRow[]) {
      const domain = pickDomain(row)
      let companyId: string | null = null
      if (domain) {
        const { data: comp } = await supabase
          .from('crm_companies')
          .upsert({
            name: row.companyName || row.company || domain,
            domain,
            linkedin_url: row.linkedinUrl,
          }, { onConflict: 'domain' })
          .select('id')
          .maybeSingle()
        companyId = (comp as { id: string } | null)?.id ?? null
        if (companyId) created.companies++
      }
      const name = pickName(row)
      const { error: leadErr } = await supabase
        .from('crm_leads')
        .insert({
          name: name ?? '(unnamed)',
          email: row.email ?? null,
          company: row.companyName || row.company || domain || null,
          company_id: companyId,
          linkedin_url: row.linkedinUrl ?? row.profileUrl ?? null,
          source: 'lead-finder',
          stage: 'new',
        })
      if (!leadErr) created.leads++
    }
    return created
  })

  return { items_scraped: items.length, fresh: (fresh as unknown[]).length, saved }
}
