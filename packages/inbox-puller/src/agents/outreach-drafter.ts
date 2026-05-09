// outreach-drafter agent
// Input:  { lead_id, channel?, sequence_step? }
// Steps:
//   1. load-lead       — pull lead + company context
//   2. draft           — AI generates subject + body using the prompt
//                        registry (key='outreach.first_touch')
//   3. queue-attempt   — insert a crm_outreach_attempts row with
//                        status='queued' so the dispatcher picks it up

import type { AgentContext, JobRow } from './runtime.js'
import { supabase } from '../supabase.js'
import { categorizeInboundMessage, callAIJSON, getAISettings } from '../ai.js'

interface DraftedEmail {
  subject: string
  body: string
}

void categorizeInboundMessage  // keep import for future inbox-replier sharing

export async function runOutreachDrafter(ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  const channel = (job.input.channel as string | undefined) ?? 'email'

  // ── Step 1: load lead context ────────────────────────────────────
  const lead = await ctx.step('load-lead', { lead_id: job.lead_id }, async () => {
    if (!job.lead_id) throw new Error('lead_id missing on job input')
    const { data } = await supabase
      .from('crm_leads')
      .select('id, name, email, company, service_interest, ai_score, ai_notes, notes, linkedin_url, company_id')
      .eq('id', job.lead_id)
      .maybeSingle()
    if (!data) throw new Error(`lead ${job.lead_id} not found`)
    let companyDomain: string | null = null
    if ((data as { company_id?: string | null }).company_id) {
      const { data: comp } = await supabase
        .from('crm_companies').select('domain').eq('id', (data as { company_id: string }).company_id).maybeSingle()
      companyDomain = (comp as { domain: string | null } | null)?.domain ?? null
    }
    return { ...(data as Record<string, unknown>), company_domain: companyDomain }
  })

  // ── Step 2: AI-draft subject + body ──────────────────────────────
  const draft = await ctx.step('draft', { lead, channel }, async (s) => {
    const settings = await getAISettings()
    const prompt = `You are an outbound BDR for ${settings?.company_name ?? 'our team'}. Tone: ${settings?.ai_outreach_tone ?? 'professional'}.
Draft a ${channel === 'email' ? 'short outbound EMAIL (subject + body)' : `${channel} message`} to this prospect.

Lead:
  name: ${(lead as { name?: string }).name ?? '(unknown)'}
  email: ${(lead as { email?: string }).email ?? '(unknown)'}
  company: ${(lead as { company?: string }).company ?? '(unknown)'}
  domain: ${(lead as { company_domain?: string }).company_domain ?? '(unknown)'}
  service interest: ${(lead as { service_interest?: string }).service_interest ?? '(unknown)'}
  prior notes: ${(lead as { notes?: string }).notes ?? '(none)'}

Constraints:
  - 4–7 sentences max, no fluff.
  - One specific concrete next step.
  ${settings?.scheduling_url ? `- Include the scheduling link: ${settings.scheduling_url}` : '- Propose 2 specific time windows next week.'}

Return JSON: {"subject":"...","body":"..."}.${channel === 'email' ? '' : ' Subject can be empty for non-email channels.'}`

    const out = await callAIJSON<DraftedEmail>({ userPrompt: prompt, maxTokens: 700 })
    if (!out?.body) throw new Error('AI did not return a body')
    s.cost({ model: settings?.active_ai_model, cost_cents: 0 })
    return out
  })

  // ── Step 3: queue the attempt for the dispatcher ─────────────────
  const attempt = await ctx.step('queue-attempt', { channel, draft }, async () => {
    const { data, error } = await supabase
      .from('crm_outreach_attempts')
      .insert({
        lead_id: job.lead_id,
        channel,
        status: 'queued',
        metadata: {
          subject: (draft as DraftedEmail).subject,
          body:    (draft as DraftedEmail).body,
          drafted_by: 'outreach-drafter',
          job_id: ctx.jobId,
        },
      })
      .select('id')
      .maybeSingle()
    if (error) throw new Error(error.message)
    return { attempt_id: (data as { id: string } | null)?.id }
  })

  return {
    drafted: { subject: (draft as DraftedEmail).subject, body: (draft as DraftedEmail).body },
    attempt_id: (attempt as { attempt_id: string }).attempt_id,
  }
}
