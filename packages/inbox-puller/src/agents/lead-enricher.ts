// lead-enricher agent — waterfall enrichment
//
// For each missing field on the lead, walk a configured provider chain
// and accept the first result whose confidence clears a threshold. Per-
// field provenance is recorded on crm_leads.provenance so subsequent
// runs know which provider supplied which field (and don't downgrade).
//
// Default provider order:
//   email:    hunter → apollo
//   title:    apollo
//   phone:    apollo
//   linkedin: apollo
//
// Adding a third email provider (findymail / anymailfinder) is a ~30 LOC
// change: implement the integration, add it to the chain, done.
//
// Steps:
//   1. load-lead
//   2. resolve-email       (waterfall, only if email missing)
//   3. resolve-person      (Apollo enrichment, fills title/phone/linkedin)
//   4. update-lead         (single update with all new fields + provenance)

import type { AgentContext, JobRow } from './runtime.js'
import { supabase, loadProviderCredential } from '../supabase.js'
import { findEmail }     from '@imba/shared/integrations/hunter'
import { enrichPerson }  from '@imba/shared/integrations/apollo'

const EMAIL_SCORE_MIN = 70   // Hunter score; Apollo emails are accepted as-is.

interface LeadShape {
  id: string
  name: string | null
  email: string | null
  title: string | null
  phone: string | null
  company: string | null
  linkedin_url: string | null
  company_id: string | null
  provenance: Record<string, string> | null
  domain: string | null
}

interface EmailResolution {
  email: string
  source: string                // 'hunter' | 'apollo'
  score?: number
}

async function tryHunter(lead: LeadShape): Promise<EmailResolution | null> {
  if (!lead.domain) return null
  const cred = await loadProviderCredential('hunter')
  if (!cred?.apiKey) return null
  const found = await findEmail(cred, {
    domain: lead.domain,
    fullName: lead.name ?? undefined,
  })
  if (!found?.email) return null
  if ((found.score ?? 0) < EMAIL_SCORE_MIN) return null
  return { email: found.email, source: 'hunter', score: found.score }
}

async function tryApolloEmail(lead: LeadShape): Promise<EmailResolution | null> {
  if (!lead.domain && !lead.linkedin_url) return null
  const cred = await loadProviderCredential('apollo')
  if (!cred?.apiKey) return null
  const enriched = await enrichPerson(cred, {
    linkedinUrl: lead.linkedin_url ?? undefined,
    domain: lead.domain ?? undefined,
  })
  const e = enriched as { email?: string } | null
  if (!e?.email) return null
  return { email: e.email, source: 'apollo' }
}

export async function runLeadEnricher(ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  const lead = await ctx.step('load-lead', { lead_id: job.lead_id }, async () => {
    if (!job.lead_id) throw new Error('lead_id missing')
    const { data } = await supabase
      .from('crm_leads')
      .select('id, name, email, title, phone, company, linkedin_url, company_id, provenance')
      .eq('id', job.lead_id)
      .maybeSingle()
    if (!data) throw new Error(`lead ${job.lead_id} not found`)
    let domain: string | null = null
    if ((data as { company_id?: string | null }).company_id) {
      const { data: c } = await supabase
        .from('crm_companies').select('domain').eq('id', (data as { company_id: string }).company_id).maybeSingle()
      domain = (c as { domain: string | null } | null)?.domain ?? null
    }
    return { ...(data as Omit<LeadShape, 'domain'>), domain } as LeadShape
  }) as LeadShape

  // ── Email waterfall: hunter → apollo. Skip if lead already has email.
  let emailResolution: EmailResolution | null = null
  if (!lead.email) {
    emailResolution = await ctx.step('resolve-email', {
      domain: lead.domain,
      name: lead.name,
      chain: ['hunter', 'apollo'],
    }, async (s) => {
      const hunter = await tryHunter(lead)
      if (hunter) { s.summary(`Hunter returned ${hunter.email} (score ${hunter.score ?? '?'})`); return hunter }
      const apollo = await tryApolloEmail(lead)
      if (apollo) { s.summary(`Apollo returned ${apollo.email} (Hunter had no match)`); return apollo }
      s.summary(`No provider returned an email for ${lead.domain ?? lead.name ?? 'this lead'}`)
      return null
    }) as EmailResolution | null
  }

  // ── Apollo person enrichment: title/phone/linkedin (only fills missing).
  // Done as a single Apollo call, then we merge field-by-field with
  // provenance tracking. If we already used Apollo to resolve email above,
  // we can skip this — but the data shape from enrichPerson is rich.
  const personData = await ctx.step('resolve-person', {
    email: emailResolution?.email ?? lead.email,
    linkedin_url: lead.linkedin_url,
    has_title: !!lead.title,
    has_phone: !!lead.phone,
  }, async () => {
    // Skip the call entirely if we already have every field Apollo fills.
    if (lead.title && lead.phone && lead.linkedin_url) return null
    const cred = await loadProviderCredential('apollo')
    if (!cred?.apiKey) return null
    return enrichPerson(cred, {
      email:       emailResolution?.email ?? lead.email ?? undefined,
      linkedinUrl: lead.linkedin_url ?? undefined,
      domain:      lead.domain ?? undefined,
    })
  })

  // ── Merge updates + provenance.
  const update: Record<string, unknown> = {}
  const provenance: Record<string, string> = { ...(lead.provenance ?? {}) }

  if (emailResolution && !lead.email) {
    update.email = emailResolution.email
    provenance.email = emailResolution.source
  }
  if (personData && typeof personData === 'object') {
    const p = personData as {
      title?: string
      phone_numbers?: Array<{ raw_number: string }>
      linkedin_url?: string
      email?: string
    }
    if (p.title && !lead.title)               { update.title = p.title;            provenance.title = 'apollo' }
    if (p.phone_numbers?.[0]?.raw_number && !lead.phone) {
                                                update.phone = p.phone_numbers[0].raw_number
                                                provenance.phone = 'apollo'
    }
    if (p.linkedin_url && !lead.linkedin_url) { update.linkedin_url = p.linkedin_url; provenance.linkedin = 'apollo' }
  }

  await ctx.step('update-lead', {
    fields: Object.keys(update),
    provenance_changed: Object.keys(provenance).length !== Object.keys(lead.provenance ?? {}).length,
  }, async (s) => {
    if (Object.keys(update).length === 0) { s.summary('Nothing new to write — no fresh fields'); return { updated: false } }
    update.provenance = provenance
    update.updated_at = new Date().toISOString()
    const { error } = await supabase.from('crm_leads').update(update).eq('id', job.lead_id!)
    if (error) throw new Error(error.message)
    const fields = Object.keys(update).filter(k => k !== 'provenance' && k !== 'updated_at')
    s.summary(`Wrote ${fields.length} field${fields.length === 1 ? '' : 's'}: ${fields.join(', ')}`)
    return { updated: true, fields }
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
    email_resolved: emailResolution ? { source: emailResolution.source, score: emailResolution.score } : null,
    apollo_used: !!personData,
    provenance,
  }
}
