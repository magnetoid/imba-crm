// inbox-replier agent
// Input:  { message_id }
// Steps:
//   1. load-message
//   2. draft-reply  (uses the categorize prompt — already runs by default
//                    on inbound, but operators can also fire this on demand
//                    to get a fresh draft using the latest prompt)
//   3. queue-attempt (writes the reply as a queued attempt; operator can
//                     approve in the Agents UI even if the inbox-categorize
//                     toggle is off)

import type { AgentContext, JobRow } from './runtime.js'
import { supabase } from '../supabase.js'
import { categorizeInboundMessage } from '../ai.js'

export async function runInboxReplier(ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  const messageId = job.input.message_id as string | undefined
  if (!messageId) throw new Error('message_id missing on job input')

  const msg = await ctx.step('load-message', { message_id: messageId }, async () => {
    const { data } = await supabase
      .from('crm_inbox_messages')
      .select('id, lead_id, direction, subject, body, from_email, metadata')
      .eq('id', messageId)
      .maybeSingle()
    if (!data) throw new Error('message not found')
    return data
  })
  const message = msg as {
    id: string; lead_id: string | null; subject: string | null;
    body: string; from_email: string | null;
    metadata: Record<string, unknown> | null;
  }

  const draft = await ctx.step('draft-reply', { subject: message.subject, from: message.from_email }, async (s) => {
    const out = await categorizeInboundMessage({
      from_email: message.from_email,
      subject: message.subject,
      body: message.body,
    })
    if (!out) throw new Error('AI categorize returned nothing')
    s.cost({ cost_cents: 0 })
    const replyLen = (out as { suggested_reply?: string }).suggested_reply?.length ?? 0
    s.summary(`Categorised as ${(out as { category: string }).category} (${(out as { sentiment: string }).sentiment}); drafted ${replyLen}-char reply`)
    return out
  })

  // Persist on the inbox row too (so the existing Inbox UI sees the
  // sentiment/category badges).
  await supabase.from('crm_inbox_messages').update({
    ai_category: (draft as { category: string }).category,
    ai_sentiment: (draft as { sentiment: string }).sentiment,
    ai_suggested_reply: (draft as { suggested_reply: string }).suggested_reply,
    status: 'read',
  }).eq('id', message.id)

  // Choose the channel: if the inbound came via the widget, reply via
  // the widget (insert outbound on crm_inbox_messages). Otherwise queue
  // an email attempt for the dispatcher.
  const isWidget = (message.metadata as { source?: string } | null)?.source === 'widget'
  const conversationId = (message.metadata as { conversation_id?: string } | null)?.conversation_id

  if (isWidget && conversationId) {
    await ctx.step('queue-widget-reply', { conversation_id: conversationId }, async () => {
      await supabase.from('crm_inbox_messages').insert({
        lead_id: message.lead_id,
        direction: 'outbound',
        subject: null,
        body: (draft as { suggested_reply: string }).suggested_reply,
        from_email: null,
        to_email: message.from_email,
        status: 'read',
        received_at: new Date().toISOString(),
        type: 'general',
        priority: 'normal',
        metadata: { source: 'widget', conversation_id: conversationId, drafted_by: 'inbox-replier' },
      })
      return { queued: 'widget' }
    })
  } else if (message.lead_id) {
    await ctx.step('queue-email-reply', { lead_id: message.lead_id }, async () => {
      await supabase.from('crm_outreach_attempts').insert({
        lead_id: message.lead_id,
        channel: 'email',
        status: 'queued',
        metadata: {
          subject: 'Re: ' + (message.subject ?? '(no subject)'),
          body: (draft as { suggested_reply: string }).suggested_reply,
          drafted_by: 'inbox-replier',
          job_id: ctx.jobId,
          in_reply_to_message_id: message.id,
        },
      })
      return { queued: 'email' }
    })
  }

  // If the AI categorised this as a meeting_request, fan out to
  // meeting-booker so the next outbound already embeds a booking link
  // tied to the operator's Cal.com / scheduling URL. The meeting-booker
  // job goes through the same autonomy gates as everything else.
  if ((draft as { category: string }).category === 'meeting_request' && message.lead_id) {
    await ctx.step('fanout-meeting-booker', { lead_id: message.lead_id }, async () => {
      const { error } = await supabase.from('crm_agent_jobs').insert({
        agent_kind: 'meeting-booker',
        status: 'queued',
        input: { lead_id: message.lead_id, message_id: message.id },
        lead_id: message.lead_id,
        triggered_by: 'inbox-replier',
      })
      if (error) throw new Error(error.message)
      return { fanout: 'meeting-booker' }
    })
  }

  return {
    category: (draft as { category: string }).category,
    sentiment: (draft as { sentiment: string }).sentiment,
  }
}
