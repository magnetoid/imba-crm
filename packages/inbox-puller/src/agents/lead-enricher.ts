// lead-enricher agent
// Input:  { lead_id }
// Steps:
//   1. load-lead
//   2. find-email      (Hunter, if no email yet)
//   3. enrich-person   (Apollo)
//   4. update-lead

import type { AgentContext, JobRow } from './runtime.js'
import { supabase, loadProviderCredential } from '../supabase.js'
import { findEmail }     from '@imba/shared/integrations/hunter'
import { enrichPerson }  from '@imba/shared/integrations/apollo'

export async function runLeadEnricher(ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  const lead = await ctx.step('load-lead', { lead_id: job.lead_id }, async () => {
    if (!job.lead_id) throw new Error('lead_id missing')
    const { data } = await supabase
      .from('crm_leads')
      .select('id, name, email, company, linkedin_url, company_id')
      .eq('id', job.lead_id)
      .maybeSingle()
    if (!data) throw new Error(`lead ${job.lead_id} not found`)
    let domain: string | null = null
    if ((data as { company_id?: string | null }).company_id) {
      const { data: c } = await supabase
        .from('crm_companies').select('domain').eq('id', (data as { company_id: string }).company_id).maybeSingle()
      domain = (c as { domain: string | null } | null)?.domain ?? null
    }
    return { ...(data as Record<string, unknown>), domain }
  })

  // ── Hunter: only if we don't have an email yet and have a domain.
  let huntedEmail: string | null = null
  if (!(lead as { email?: string }).email && (lead as { domain?: string }).domain) {
    huntedEmail = await ctx.step('find-email', { domain: (lead as { domain: string }).domain, name: (lead as { name?: string }).name }, async () => {
      const cred = await loadProviderCredential('hunter')
      if (!cred?.apiKey) return null
      const found = await findEmail(cred, {
        domain: (lead as { domain: string }).domain,
        fullName: (lead as { name?: string }).name ?? undefined,
      })
      return found?.email ?? null
    })
  }

  // ── Apollo: enrich person details if we have any identifier.
  const enriched = await ctx.step('enrich-person', {
    email: huntedEmail ?? (lead as { email?: string }).email,
    linkedin_url: (lead as { linkedin_url?: string }).linkedin_url,
  }, async () => {
    const cred = await loadProviderCredential('apollo')
    if (!cred?.apiKey) return null
    return enrichPerson(cred, {
      email:       huntedEmail ?? (lead as { email?: string }).email,
      linkedinUrl: (lead as { linkedin_url?: string }).linkedin_url,
      domain:      (lead as { domain?: string }).domain,
    })
  })

  // ── Persist the enrichment back onto the lead.
  await ctx.step('update-lead', { huntedEmail, enriched }, async () => {
    const update: Record<string, unknown> = {}
    if (huntedEmail && !(lead as { email?: string }).email) update.email = huntedEmail
    if (enriched && typeof enriched === 'object') {
      const e = enriched as { title?: string; phone_numbers?: Array<{ raw_number: string }>; linkedin_url?: string }
      if (e.title)                                       update.title         = e.title
      if (e.phone_numbers?.[0]?.raw_number)              update.phone         = e.phone_numbers[0].raw_number
      if (e.linkedin_url && !(lead as { linkedin_url?: string }).linkedin_url) update.linkedin_url = e.linkedin_url
    }
    if (Object.keys(update).length === 0) return { updated: false }
    update.updated_at = new Date().toISOString()
    const { error } = await supabase.from('crm_leads').update(update).eq('id', job.lead_id!)
    if (error) throw new Error(error.message)
    return { updated: true, fields: Object.keys(update) }
  })

  // ── Trigger scoring once the enrichment is in. The lead-scorer is in
  // 'auto' mode by default, so this is fire-and-forget — the agent loop
  // picks it up on the next tick.
  await supabase.from('crm_agent_jobs').insert({
    agent_kind: 'lead-scorer',
    lead_id: job.lead_id,
    input: { reason: 'enrichment-completed' },
    triggered_by: 'lead-enricher',
  })

  // ── Also queue the account-researcher so the next outreach-drafter
  // run has pitch_hooks + headline_news to weave into the opener. The
  // researcher is idempotent and skips if research is <7d old.
  await supabase.from('crm_agent_jobs').insert({
    agent_kind: 'account-researcher',
    lead_id: job.lead_id,
    input: { reason: 'enrichment-completed' },
    triggered_by: 'lead-enricher',
  })

  return {
    hunted_email: huntedEmail,
    enriched_apollo: !!enriched,
  }
}
