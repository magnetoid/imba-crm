// prospect-pipeline (Phase 10.7) — autonomous orchestrator. Once-a-day
// glue that runs the whole reach-best-customers loop:
//
//   1. lead-finder         — Apify search using ICP-derived queries
//                              from crm_runtime_settings.lead_pipelines
//   2. lead-enricher       — Hunter + Apollo for fresh leads (auto-
//                              chained by lead-finder already)
//   3. account-researcher  — chained by enricher
//   4. lead-scorer         — chained by enricher
//   5. signal-watcher tick — already running on the worker; no work here
//   6. objection-tracker   — sweep last 7d
//
// Doesn't actually *run* the agents itself — instead it queues them
// with the right inputs. The agent loop + the existing chains then
// take over. This means every action still goes through three-mode
// autonomy + audit trail + cost caps.
//
// Input:  { mode?: 'sweep' | 'find-only' | 'research-only', max_leads?: 50 }

import type { AgentContext, JobRow } from './runtime.js'
import { supabase } from '../supabase.js'

interface LeadPipeline {
  actor_id: string
  actor_input: Record<string, unknown>
  max_save?: number
}

export async function runProspectPipeline(_ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  const mode = ((job.input?.mode as string | undefined) ?? 'sweep') as 'sweep' | 'find-only' | 'research-only'
  const maxLeads = (job.input?.max_leads as number | undefined) ?? 50

  let queuedFinder = 0
  let queuedResearcher = 0
  let queuedObjectionTracker = 0

  // ── 1. Run each configured lead-finder pipeline ─────────────────────
  if (mode === 'sweep' || mode === 'find-only') {
    const { data: settings } = await supabase
      .from('crm_runtime_settings')
      .select('lead_pipelines')
      .eq('id', 1).maybeSingle()
    const pipelines = (((settings as { lead_pipelines?: LeadPipeline[] } | null)?.lead_pipelines) ?? []) as LeadPipeline[]
    for (const p of pipelines) {
      if (!p.actor_id) continue
      await supabase.from('crm_agent_jobs').insert({
        agent_kind: 'lead-finder',
        input: {
          actor_id: p.actor_id,
          actor_input: p.actor_input ?? {},
          max_save: p.max_save ?? maxLeads,
        },
        triggered_by: 'prospect-pipeline',
      })
      queuedFinder++
    }
  }

  // ── 2. Refresh research on stale companies ─────────────────────────
  if (mode === 'sweep' || mode === 'research-only') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
    // Pick leads whose company.research is missing or older than 7d,
    // capped at maxLeads.
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, company_id, crm_companies!inner(research_at)')
      .not('company_id', 'is', null)
      .or(`research_at.is.null,research_at.lt.${sevenDaysAgo}`, { foreignTable: 'crm_companies' })
      .limit(maxLeads)
    const ids = ((leads ?? []) as Array<{ id: string }>).map(r => r.id)
    for (const id of ids) {
      await supabase.from('crm_agent_jobs').insert({
        agent_kind: 'account-researcher',
        lead_id: id,
        input: { reason: 'prospect-pipeline sweep' },
        triggered_by: 'prospect-pipeline',
      })
      queuedResearcher++
    }
  }

  // ── 3. Sweep for objections in last 7d of conversations ───────────
  if (mode === 'sweep') {
    await supabase.from('crm_agent_jobs').insert({
      agent_kind: 'objection-tracker',
      input: { days: 7, reason: 'prospect-pipeline sweep' },
      triggered_by: 'prospect-pipeline',
    })
    queuedObjectionTracker = 1
  }

  return {
    mode,
    queued: {
      'lead-finder':       queuedFinder,
      'account-researcher': queuedResearcher,
      'objection-tracker':  queuedObjectionTracker,
    },
  }
}
