// lead-scorer agent
//
// Computes three components — fit / intent / engagement — from existing
// signals. Runs in 'auto' mode (no human approval needed) and is cheap:
// pure SQL aggregation + a small ICP rule check, no LLM call on the hot
// path. Triggered from:
//
//   - postgres trigger on crm_visitor_events when an event gets attached
//     to a lead (anonymous → known)
//   - lead-enricher final step (right after Apollo/Hunter writeback)
//   - manual "Recompute scores" button in the Pipeline UI
//
// Each run writes a crm_lead_scores history row + updates the live
// crm_leads.{fit,intent,engagement}_score columns the SPA reads from.
//
// Input:  { lead_id }

import type { AgentContext, JobRow } from './runtime.js'
import { supabase } from '../supabase.js'

interface LeadRow {
  id: string
  email?: string | null
  company?: string | null
  service_interest?: string | null
  notes?: string | null
  title?: string | null
  linkedin_url?: string | null
  company_id?: string | null
}

interface CompanyRow {
  industry?: string | null
  size?: string | null
  country?: string | null
  tech_stack?: Record<string, unknown> | null
}

interface ICPRules {
  industries?: string[]
  employee_min?: number
  employee_max?: number
  countries?: string[]
  titles_must_match?: string[]
  tech_must_match?: string[]
  tech_block?: string[]
}

const INTENT_WEIGHTS = {
  visit_30d:        4,    // each page view in last 30 days
  visit_pricing:    15,   // any visit to /pricing in last 30 days
  email_open:       3,
  email_click:      8,
  reply:            25,
  meeting_request:  30,
  widget_message:   20,
} as const

const HALF_LIFE_DAYS = 14 // intent decays — older signals count half

export async function runLeadScorer(_ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  if (!job.lead_id) throw new Error('lead_id missing on job input')

  // ── Load lead + company side-by-side. Single round trip via two
  // queries since PostgREST joins are awkward and this is run-once.
  const { data: leadData } = await supabase
    .from('crm_leads')
    .select('id, email, company, service_interest, notes, title, linkedin_url, company_id')
    .eq('id', job.lead_id)
    .maybeSingle()
  const lead = leadData as LeadRow | null
  if (!lead) throw new Error(`lead ${job.lead_id} not found`)

  let company: CompanyRow | null = null
  if (lead.company_id) {
    const { data: c } = await supabase
      .from('crm_companies')
      .select('industry, size, country, tech_stack')
      .eq('id', lead.company_id)
      .maybeSingle()
    company = (c as CompanyRow | null) ?? null
  }

  const { data: settingsData } = await supabase
    .from('crm_runtime_settings')
    .select('icp_rules')
    .eq('id', 1)
    .maybeSingle()
  const icp = ((settingsData as { icp_rules?: ICPRules } | null)?.icp_rules ?? {}) as ICPRules

  const reasons: string[] = []

  // ── fit_score ──────────────────────────────────────────────────────
  const fit = scoreFit(lead, company, icp, reasons)

  // ── intent_score ───────────────────────────────────────────────────
  const intent = await scoreIntent(lead.id, reasons)

  // ── engagement_score ───────────────────────────────────────────────
  const engagement = await scoreEngagement(lead.id, reasons)

  const now = new Date().toISOString()
  await supabase.from('crm_leads').update({
    fit_score: fit,
    intent_score: intent,
    engagement_score: engagement,
    last_scored_at: now,
  }).eq('id', lead.id)

  await supabase.from('crm_lead_scores').insert({
    lead_id: lead.id,
    fit_score: fit,
    intent_score: intent,
    engagement_score: engagement,
    reasons,
    computed_by: 'lead-scorer',
  })

  return { fit, intent, engagement, reasons }
}

// ── fit ──────────────────────────────────────────────────────────────
function scoreFit(lead: LeadRow, company: CompanyRow | null, icp: ICPRules, reasons: string[]): number {
  let score = 50
  let any = false

  if (icp.industries && icp.industries.length > 0) {
    any = true
    const industry = (company?.industry ?? '').toLowerCase()
    if (industry && icp.industries.some(i => industry.includes(i.toLowerCase()))) {
      score += 15; reasons.push('fit:+industry-match')
    } else if (industry) {
      score -= 10; reasons.push('fit:-industry-miss')
    }
  }

  if (icp.titles_must_match && icp.titles_must_match.length > 0) {
    any = true
    const title = (lead.title ?? '').toLowerCase()
    if (title && icp.titles_must_match.some(t => title.includes(t.toLowerCase()))) {
      score += 15; reasons.push('fit:+title-match')
    } else if (title) {
      score -= 5; reasons.push('fit:-title-junior')
    }
  }

  if (icp.countries && icp.countries.length > 0 && company?.country) {
    any = true
    if (icp.countries.includes(company.country)) {
      score += 5; reasons.push('fit:+country')
    } else {
      score -= 5; reasons.push('fit:-country-mismatch')
    }
  }

  if (icp.employee_min !== undefined || icp.employee_max !== undefined) {
    any = true
    const size = parseEmployeeRange(company?.size ?? null)
    if (size != null) {
      const min = icp.employee_min ?? 0
      const max = icp.employee_max ?? Number.MAX_SAFE_INTEGER
      if (size >= min && size <= max) { score += 10; reasons.push('fit:+size') }
      else                            { score -= 10; reasons.push('fit:-size') }
    }
  }

  if (icp.tech_block && company?.tech_stack) {
    const techNames = Object.keys(company.tech_stack).map(t => t.toLowerCase())
    if (icp.tech_block.some(b => techNames.includes(b.toLowerCase()))) {
      score -= 30; reasons.push('fit:-blocked-tech')
    }
  }

  if (icp.tech_must_match && icp.tech_must_match.length > 0 && company?.tech_stack) {
    any = true
    const techNames = Object.keys(company.tech_stack).map(t => t.toLowerCase())
    if (icp.tech_must_match.some(b => techNames.includes(b.toLowerCase()))) {
      score += 10; reasons.push('fit:+tech')
    }
  }

  if (lead.email) { score += 5 }
  if (lead.linkedin_url) { score += 5 }

  if (!any) {
    // No ICP rules configured yet — bias toward "we don't know" so the
    // operator isn't tricked into thinking everyone is qualified.
    score = 50
    reasons.push('fit:icp-not-configured')
  }

  return clamp(score)
}

function parseEmployeeRange(size: string | null): number | null {
  if (!size) return null
  const m = size.match(/(\d+)/g)
  if (!m) return null
  const ns = m.map(Number)
  return Math.round(ns.reduce((a, b) => a + b, 0) / ns.length)
}

// ── intent ───────────────────────────────────────────────────────────
async function scoreIntent(leadId: string, reasons: string[]): Promise<number> {
  let score = 0

  // Visitor events — page views in last 30d.
  const { data: visits } = await supabase
    .from('crm_visitor_events')
    .select('id, url, created_at')
    .eq('lead_id', leadId)
    .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())
    .limit(200)
  const vs = (visits as Array<{ id: string; url: string | null; created_at: string }> | null) ?? []
  if (vs.length > 0) {
    score += vs.length * INTENT_WEIGHTS.visit_30d * decayFactor(vs[0].created_at)
    reasons.push(`intent:+${vs.length}-visits-30d`)
    if (vs.some(v => /\/(pricing|plans|book|contact|demo)/i.test(v.url ?? ''))) {
      score += INTENT_WEIGHTS.visit_pricing
      reasons.push('intent:+pricing-page')
    }
  }

  // Email engagement.
  const { data: events } = await supabase
    .from('crm_email_events')
    .select('event_type, created_at, email_id')
    .in('event_type', ['open', 'click'])
    .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())
    .limit(200)
  const evs = (events as Array<{ event_type: string; created_at: string; email_id: string }> | null) ?? []
  if (evs.length > 0) {
    // Filter to this lead's emails.
    const ids = Array.from(new Set(evs.map(e => e.email_id)))
    if (ids.length > 0) {
      const { data: emails } = await supabase
        .from('crm_outreach_emails').select('id').eq('lead_id', leadId).in('id', ids)
      const myIds = new Set(((emails as Array<{ id: string }> | null) ?? []).map(e => e.id))
      const myEvents = evs.filter(e => myIds.has(e.email_id))
      const opens = myEvents.filter(e => e.event_type === 'open').length
      const clicks = myEvents.filter(e => e.event_type === 'click').length
      if (opens > 0)  { score += opens  * INTENT_WEIGHTS.email_open;  reasons.push(`intent:+${opens}-opens`) }
      if (clicks > 0) { score += clicks * INTENT_WEIGHTS.email_click; reasons.push(`intent:+${clicks}-clicks`) }
    }
  }

  // Inbound replies + meeting requests.
  const { data: inbox } = await supabase
    .from('crm_inbox_messages')
    .select('id, ai_category, direction, received_at, metadata')
    .eq('lead_id', leadId)
    .eq('direction', 'inbound')
    .gte('received_at', new Date(Date.now() - 60 * 86400_000).toISOString())
    .limit(50)
  const ms = (inbox as Array<{ id: string; ai_category: string | null; received_at: string; metadata: Record<string, unknown> }> | null) ?? []
  if (ms.length > 0) {
    score += ms.length * INTENT_WEIGHTS.reply * decayFactor(ms[0].received_at)
    reasons.push(`intent:+${ms.length}-inbound`)
    if (ms.some(m => m.ai_category === 'meeting_request')) {
      score += INTENT_WEIGHTS.meeting_request
      reasons.push('intent:+meeting-requested')
    }
    if (ms.some(m => (m.metadata as { source?: string } | null)?.source === 'widget')) {
      score += INTENT_WEIGHTS.widget_message
      reasons.push('intent:+widget-chat')
    }
  }

  return clamp(score)
}

// ── engagement ───────────────────────────────────────────────────────
async function scoreEngagement(leadId: string, _reasons: string[]): Promise<number> {
  // Engagement = how *much* this lead has actually responded vs how many
  // touches we've sent. A lead we've emailed 6 times with zero replies
  // engages worse than one we've emailed twice and got one reply on.
  const { data: attempts } = await supabase
    .from('crm_outreach_attempts')
    .select('id, sent_at, responded_at')
    .eq('lead_id', leadId)
    .limit(100)
  const rows = (attempts as Array<{ id: string; sent_at: string | null; responded_at: string | null }> | null) ?? []
  if (rows.length === 0) return 0
  const sent = rows.filter(r => r.sent_at).length
  const responded = rows.filter(r => r.responded_at).length
  if (sent === 0) return 0
  const ratio = responded / sent
  return clamp(Math.round(ratio * 100))
}

function decayFactor(iso: string): number {
  const ageDays = (Date.now() - new Date(iso).getTime()) / 86400_000
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}
