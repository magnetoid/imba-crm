// meeting-booker agent
// Input: { lead_id, message_id?, prefer_window? }
//
// Steps:
//   1. load-lead             — pull lead
//   2. find-slots            — Cal.com /slots/available for the next N days
//   3. compose-booking-link  — build https://cal.com/<slug> URL with prefill,
//                              optionally narrowed to one of the slots
//   4. queue-attempt         — write a queued email attempt with the AI's
//                              meeting_request reply that includes the link
//
// Cal.com webhook (BOOKING_CREATED) lands separately at
// /api/webhooks/cal and inserts a crm_activities row of type='meeting'.

import type { AgentContext, JobRow } from './runtime.js'
import { supabase, loadProviderCredential } from '../supabase.js'
import { findSlots, bookingUrl } from '@imba/shared/integrations/cal'

interface RuntimeMeetingSettings {
  cal_event_type_id: string | null
  scheduling_url: string | null
  ai_outreach_tone: string
  company_name: string
}

async function loadSettings(): Promise<RuntimeMeetingSettings | null> {
  const { data } = await supabase
    .from('crm_runtime_settings')
    .select('cal_event_type_id, scheduling_url, ai_outreach_tone, company_name')
    .eq('id', 1)
    .maybeSingle()
  return (data as RuntimeMeetingSettings | null) ?? null
}

export async function runMeetingBooker(ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  const settings = await loadSettings()
  if (!settings) throw new Error('crm_runtime_settings missing')

  // ── Step 1: load the lead ────────────────────────────────────────
  const lead = await ctx.step('load-lead', { lead_id: job.lead_id }, async () => {
    if (!job.lead_id) throw new Error('lead_id missing')
    const { data } = await supabase
      .from('crm_leads')
      .select('id, name, email, company')
      .eq('id', job.lead_id)
      .maybeSingle()
    if (!data) throw new Error('lead not found')
    return data
  })

  // ── Step 2: find available slots in Cal.com ─────────────────────
  const slots = await ctx.step('find-slots', { event_type_id: settings.cal_event_type_id }, async () => {
    const cred = await loadProviderCredential('cal')
    if (!cred?.apiKey) {
      // Cal not configured — fall back to a generic scheduling URL or empty.
      return { configured: false, slots: [] as Array<{ start: string; end: string }> }
    }
    if (!settings.cal_event_type_id) {
      return { configured: false, slots: [] as Array<{ start: string; end: string }> }
    }
    const found = await findSlots(cred, {
      eventTypeId: settings.cal_event_type_id,
      daysAhead: 7,
      durationMinutes: 30,
    })
    return { configured: true, slots: found.slice(0, 5) }
  })
  const slotsResult = slots as { configured: boolean; slots: Array<{ start: string; end: string }> }

  // ── Step 3: build the booking URL the AI reply will embed ───────
  const link = await ctx.step('compose-booking-link', { slot_count: slotsResult.slots.length }, async () => {
    const leadObj = lead as { name?: string | null; email?: string | null }
    const prefill: Record<string, string> = {}
    if (leadObj.name)  prefill.name  = leadObj.name
    if (leadObj.email) prefill.email = leadObj.email

    if (settings.scheduling_url) {
      // Operator already gave us a public URL — use it.
      return { url: appendQuery(settings.scheduling_url, prefill), source: 'scheduling_url' as const }
    }
    if (settings.cal_event_type_id) {
      // Build a cal.com URL from the slug we know.
      const slug = String(settings.cal_event_type_id)
      return { url: bookingUrl(slug, prefill), source: 'cal_event_type' as const }
    }
    return { url: null, source: 'none' as const }
  })
  const linkOut = link as { url: string | null; source: string }

  // ── Step 4: queue an outbound attempt with the booking link ─────
  await ctx.step('queue-attempt', { link: linkOut.url }, async () => {
    if (!linkOut.url) {
      // Nothing useful to send. We still succeed — let the inbox-replier
      // suggest manual times in its draft.
      return { skipped: 'no booking link configured' }
    }
    const leadObj = lead as { name?: string | null }
    const slotLines = slotsResult.slots.length > 0
      ? '\n\nSome times that work for me this week:\n' + slotsResult.slots.slice(0, 3)
          .map(s => '  • ' + new Date(s.start).toLocaleString())
          .join('\n')
      : ''
    const body = `Hi${leadObj.name ? ' ' + leadObj.name.split(' ')[0] : ''},

Happy to jump on a quick call. Easiest is to grab a slot here:
${linkOut.url}${slotLines}

— ${settings.company_name || 'the team'}`
    const { data, error } = await supabase.from('crm_outreach_attempts').insert({
      lead_id: job.lead_id,
      channel: 'email',
      status: 'queued',
      metadata: {
        subject: 'Re: meeting',
        body,
        drafted_by: 'meeting-booker',
        booking_url: linkOut.url,
        slots_offered: slotsResult.slots,
        in_reply_to_message_id: job.input.message_id,
        job_id: ctx.jobId,
      },
    }).select('id').maybeSingle()
    if (error) throw new Error(error.message)
    return { attempt_id: (data as { id: string } | null)?.id }
  })

  return { booking_url: linkOut.url, slots_offered: slotsResult.slots.length }
}

function appendQuery(url: string, params: Record<string, string>): string {
  if (Object.keys(params).length === 0) return url
  const q = new URLSearchParams(params).toString()
  return url + (url.includes('?') ? '&' : '?') + q
}
