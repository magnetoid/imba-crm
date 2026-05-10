// proposal-writer (Phase 11.1)
//
// Drafts a structured proposal for a lead, weaving in:
//   - company.research.pitch_hooks (Phase 10.4)
//   - call coach_notes (Phase 7f) — next_steps + MEDDPICC qualifiers
//   - tracked objections (Phase 10.6) — preempt + counter inline
//   - service_interest + budget_range from the lead
//
// Input:  { lead_id, force?: boolean }
// Output: { proposal_id }
//
// Persisted as a crm_proposals row in status='draft' with ai_generated=true.
// The existing Proposals module UI lets the operator review / send / sign.

import type { AgentContext, JobRow } from './runtime.js'
import { supabase } from '../supabase.js'
import { callAIJSON, getAISettings } from '../ai.js'

interface ProposalDraft {
  title: string
  executive_summary: string
  project_scope: string[]
  deliverables: string[]
  timeline: string
  investment_summary: string
  amount: number | null
  next_steps: string[]
  payment_terms: string
  full_markdown: string         // the assembled doc for content text field
}

export async function runProposalWriter(_ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  if (!job.lead_id) throw new Error('lead_id missing')

  const { data: leadRow } = await supabase
    .from('crm_leads')
    .select('id, name, email, company, company_id, service_interest, budget_range, value, ai_notes, objections, notes')
    .eq('id', job.lead_id).maybeSingle()
  const lead = leadRow as {
    id: string; name: string; email: string | null; company: string | null
    company_id: string | null; service_interest: string | null; budget_range: string | null
    value: number | null; ai_notes: string | null
    objections: Array<{ slug: string; label: string; evidence: string }> | null
    notes: string | null
  } | null
  if (!lead) throw new Error(`lead ${job.lead_id} not found`)

  // Pull recent meeting coach_notes for next_steps + MEDDPICC.
  const { data: meetings } = await supabase
    .from('crm_activities')
    .select('id, subject, coach_notes, created_at')
    .eq('lead_id', lead.id)
    .eq('type', 'meeting')
    .order('created_at', { ascending: false })
    .limit(3)
  const coachNotes = ((meetings ?? []) as Array<{ coach_notes: Record<string, unknown> | null }>)
    .map(m => m.coach_notes)
    .filter((n): n is Record<string, unknown> => !!n && Object.keys(n).length > 0)

  // Pull company.research for pitch hooks.
  let companyResearch: Record<string, unknown> | null = null
  if (lead.company_id) {
    const { data: c } = await supabase
      .from('crm_companies').select('research').eq('id', lead.company_id).maybeSingle()
    companyResearch = ((c as { research: Record<string, unknown> | null } | null)?.research) ?? null
  }

  // Already have a draft proposal for this lead? Skip unless force.
  if (!job.input?.force) {
    const { data: existing } = await supabase
      .from('crm_proposals').select('id, status, created_at')
      .eq('lead_id', lead.id)
      .in('status', ['draft', 'sent'])
      .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())
      .maybeSingle()
    if (existing) {
      return { skipped: true, reason: `existing ${(existing as { status: string }).status} proposal in last 30d`, proposal_id: (existing as { id: string }).id }
    }
  }

  const settings = await getAISettings()

  const prompt = `You are drafting a B2B proposal for ${settings?.company_name ?? 'our team'}.
Tone: professional but warm. The recipient is the decision-maker; assume they're busy.

Lead context:
  name:             ${lead.name}
  company:          ${lead.company ?? '(unknown)'}
  service interest: ${lead.service_interest ?? '(unspecified)'}
  budget range:     ${lead.budget_range ?? '(unspecified)'}
  deal value:       ${lead.value ?? '(unspecified)'}
  prior notes:      ${lead.notes ?? '(none)'}

${companyResearch ? `Account research:\n${JSON.stringify({
  pitch_hooks:        (companyResearch as { pitch_hooks?: string[] }).pitch_hooks,
  headline_news:      (companyResearch as { headline_news?: unknown[] }).headline_news,
  recent_blog_topics: (companyResearch as { recent_blog_topics?: string[] }).recent_blog_topics,
  competitor_set:     (companyResearch as { competitor_set?: string[] }).competitor_set,
}, null, 2)}` : '(no account research yet)'}

${coachNotes.length > 0 ? `Recent call coach notes (most important — quote next_steps verbatim where useful):\n${JSON.stringify(coachNotes, null, 2)}` : '(no call notes)'}

${(lead.objections ?? []).length > 0 ? `Tracked objections to PREEMPT or counter inline:\n${JSON.stringify(lead.objections, null, 2)}` : '(no tracked objections)'}

Draft a proposal as JSON. Constraints:
- title is short, specific to the project (not "Proposal for {{name}}")
- executive_summary: 2-3 sentences max
- project_scope: 3-6 bullet points of what's included
- deliverables: 2-5 concrete artifacts the client receives
- timeline: a 1-line schedule, e.g. "Kick-off w/c <date> · final delivery 8 weeks"
- investment_summary: 1-2 sentences explaining the price + what it covers
- amount: numeric (the proposed price in USD); use lead.value as anchor if available, otherwise estimate from service_interest + budget_range
- next_steps: 2-3 concrete actions (e.g. "Sign this proposal", "Pay 50% deposit", "Schedule kick-off")
- payment_terms: 1 line, e.g. "50% on signing, 50% on delivery. Net 7."
- full_markdown: the assembled proposal as markdown (h1 title + sections). Include ALL fields above in narrative form. Quote ONE specific pitch_hook or headline_news in the opener.

Return ONLY valid minified JSON.`

  const draft = await callAIJSON<ProposalDraft>({ userPrompt: prompt, maxTokens: 2500 })
  if (!draft?.full_markdown) throw new Error('AI returned no proposal body')

  // Persist as a draft proposal.
  const { data, error } = await supabase
    .from('crm_proposals')
    .insert({
      lead_id: lead.id,
      title: draft.title?.slice(0, 200) ?? `Proposal for ${lead.company ?? lead.name}`,
      content: draft.full_markdown,
      amount: typeof draft.amount === 'number' ? draft.amount : null,
      status: 'draft',
      ai_generated: true,
      valid_until: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
    })
    .select('id, title, amount, status, created_at')
    .maybeSingle()
  if (error) throw new Error(error.message)
  const proposalId = (data as { id: string } | null)?.id

  // Log an activity so it shows on the timeline.
  await supabase.from('crm_activities').insert({
    lead_id: lead.id,
    type: 'proposal',
    subject: `Proposal drafted: ${draft.title?.slice(0, 120) ?? 'untitled'}`,
    body: `AI-drafted proposal · ${draft.amount ? `$${draft.amount.toLocaleString()}` : 'amount not set'} · ${settings?.active_ai_model ?? 'unknown model'}`,
    created_by: 'proposal-writer',
  })

  return {
    proposal_id: proposalId,
    title: draft.title,
    amount: draft.amount,
    sections: {
      scope_items: draft.project_scope?.length ?? 0,
      deliverables: draft.deliverables?.length ?? 0,
      next_steps: draft.next_steps?.length ?? 0,
    },
  }
}
