// Sequence dispatcher (Phase 10.1).
//
// Reads crm_lead_sequences rows where status='active' AND next_due_at <= now()
// and materialises a crm_outreach_attempts row for the current step. The
// existing channel dispatcher (channels/dispatch.ts) actually delivers
// the message; this loop just decides "the next step of sequence S is
// due for lead L, generate an attempt for it".
//
// Each step in crm_outreach_sequences.steps[] looks like:
//   { day_offset, channel, condition?, body_hint? }
// We use day_offset to compute the *next* step's next_due_at after each
// successful materialisation. condition (e.g. "no_open", "no_reply") is
// evaluated by checking the current state of the lead — if the condition
// is unmet we skip to the next step or end.
//
// On reply, the postgres trigger trg_cancel_sequence_on_reply already
// flips status='cancelled' so this loop stops touching the row.

import { supabase } from '../supabase.js'

interface SequenceStep {
  day_offset: number
  channel: string
  condition?: 'no_open' | 'no_reply' | 'no_response' | 'no_click'
  body_hint?: string
}

interface DueRow {
  id: string
  lead_id: string
  sequence_id: string
  current_step: number
  status: string
}

interface SequenceTemplate {
  id: string
  name: string
  steps: SequenceStep[]
}

interface LeadRow {
  id: string
  name: string | null
  email: string | null
  company: string | null
  linkedin_url: string | null
}

const BATCH = 25

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'sequence-dispatcher', ...extra, time: new Date().toISOString() }))
}

export async function dispatchSequences() {
  const { data: due } = await supabase
    .from('crm_lead_sequences')
    .select('id, lead_id, sequence_id, current_step, status')
    .eq('status', 'active')
    .lte('next_due_at', new Date().toISOString())
    .order('next_due_at', { ascending: true })
    .limit(BATCH)

  const rows = (due as DueRow[] | null) ?? []
  if (rows.length === 0) return

  // Cache sequence templates we touch this tick.
  const templateCache = new Map<string, SequenceTemplate>()

  for (const row of rows) {
    try {
      // Optimistically lock by stamping a far-future next_due_at; if
      // another worker grabs it first we just no-op.
      const claim = await supabase
        .from('crm_lead_sequences')
        .update({ next_due_at: new Date(Date.now() + 60_000).toISOString() })
        .eq('id', row.id)
        .eq('status', 'active')
        .lte('next_due_at', new Date().toISOString())
        .select('id')
        .maybeSingle()
      if (!claim.data) continue

      // Load the template (cached per tick).
      let tpl = templateCache.get(row.sequence_id)
      if (!tpl) {
        const { data } = await supabase
          .from('crm_outreach_sequences')
          .select('id, name, steps')
          .eq('id', row.sequence_id)
          .maybeSingle()
        if (!data) {
          await markSequence(row.id, 'cancelled', 'sequence template missing')
          continue
        }
        tpl = data as SequenceTemplate
        templateCache.set(row.sequence_id, tpl)
      }

      const step = tpl.steps[row.current_step]
      if (!step) {
        await markSequence(row.id, 'completed')
        continue
      }

      // Evaluate the step's condition (skip if unmet).
      const proceed = await evaluateCondition(row.lead_id, step.condition)
      if (!proceed.proceed) {
        log('info', 'sequence step skipped', {
          sequence_id: row.id, step: row.current_step, reason: proceed.reason,
        })
        await advanceCursor(row, tpl)
        continue
      }

      // Pull lead context the channel handlers need.
      const { data: leadData } = await supabase
        .from('crm_leads')
        .select('id, name, email, company, linkedin_url')
        .eq('id', row.lead_id)
        .maybeSingle()
      const lead = leadData as LeadRow | null
      if (!lead) {
        await markSequence(row.id, 'cancelled', 'lead deleted')
        continue
      }

      // For email steps, queue an outreach-drafter agent job which will
      // generate subject + body and queue the actual attempt. This keeps
      // copy-quality the same as manual drafts. For other channels we
      // queue a bare attempt with body_hint as a placeholder.
      if (step.channel === 'email') {
        await supabase.from('crm_agent_jobs').insert({
          agent_kind: 'outreach-drafter',
          lead_id: row.lead_id,
          input: {
            channel: 'email',
            sequence_id: row.sequence_id,
            sequence_step: row.current_step,
            body_hint: step.body_hint,
          },
          triggered_by: `sequence:${row.id}`,
        })
      } else {
        // Channels (contact_form / linkedin_connect / linkedin_dm) skip
        // the AI draft; we queue an attempt directly. The drafter agent
        // will be invoked by the channel handler if it needs copy.
        await supabase.from('crm_outreach_attempts').insert({
          lead_id: row.lead_id,
          sequence_id: row.sequence_id,
          step_no: row.current_step,
          channel: step.channel,
          status: 'queued',
          metadata: {
            triggered_by: `sequence:${row.id}`,
            body_hint: step.body_hint,
          },
        })
      }

      log('info', 'sequence step materialised', {
        sequence_id: row.id, step: row.current_step, channel: step.channel,
      })
      await advanceCursor(row, tpl)
    } catch (err) {
      log('error', 'dispatch step failed', {
        sequence_id: row.id, error: (err as Error).message,
      })
    }
  }
}

async function advanceCursor(row: DueRow, tpl: SequenceTemplate) {
  const nextStep = row.current_step + 1
  if (nextStep >= tpl.steps.length) {
    await markSequence(row.id, 'completed')
    return
  }
  // Compute next_due_at by adding (next.day_offset - current.day_offset)
  // days from now. We anchor on now() rather than the lead's started_at
  // so a sequence paused for a week resumes "today + delta", not "back
  // when it should have run".
  const cur = tpl.steps[row.current_step].day_offset
  const nxt = tpl.steps[nextStep].day_offset
  const deltaDays = Math.max(0, nxt - cur)
  const next = new Date(Date.now() + deltaDays * 86400_000).toISOString()
  await supabase.from('crm_lead_sequences').update({
    current_step: nextStep,
    next_due_at: next,
  }).eq('id', row.id)
}

async function markSequence(id: string, status: 'completed' | 'cancelled', reason?: string) {
  const update: Record<string, unknown> = { status }
  if (status === 'completed') update.completed_at = new Date().toISOString()
  if (status === 'cancelled') {
    update.cancelled_at = new Date().toISOString()
    if (reason) update.cancelled_reason = reason
  }
  await supabase.from('crm_lead_sequences').update(update).eq('id', id)
}

// Evaluate a step's condition against the lead's current state. The
// dispatcher uses this to skip steps that don't apply (e.g. the LinkedIn
// step in a 7-touch sequence is skipped if the lead already replied).
async function evaluateCondition(leadId: string, condition?: SequenceStep['condition']): Promise<{ proceed: boolean; reason?: string }> {
  if (!condition) return { proceed: true }

  // Pull recent attempts for this lead.
  const { data: attempts } = await supabase
    .from('crm_outreach_attempts')
    .select('status, sent_at, responded_at, metadata')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(10)
  const rows = (attempts ?? []) as Array<{ status: string; sent_at: string | null; responded_at: string | null; metadata: Record<string, unknown> | null }>

  if (condition === 'no_reply' || condition === 'no_response') {
    const replied = rows.some(r => r.responded_at)
    return replied ? { proceed: false, reason: 'lead_replied' } : { proceed: true }
  }
  if (condition === 'no_open') {
    // Look at email events for any open in the last 14d.
    const { data: opens } = await supabase
      .from('crm_email_events')
      .select('id')
      .eq('event_type', 'open')
      .gte('created_at', new Date(Date.now() - 14 * 86400_000).toISOString())
      .limit(1)
    return (opens && opens.length > 0) ? { proceed: false, reason: 'lead_opened' } : { proceed: true }
  }
  if (condition === 'no_click') {
    const { data: clicks } = await supabase
      .from('crm_email_events')
      .select('id')
      .eq('event_type', 'click')
      .gte('created_at', new Date(Date.now() - 14 * 86400_000).toISOString())
      .limit(1)
    return (clicks && clicks.length > 0) ? { proceed: false, reason: 'lead_clicked' } : { proceed: true }
  }
  return { proceed: true }
}
