// Email channel — bridges into the existing crm_outreach_emails table.
// Creates a row with status='approved' so the established pollOutreach
// loop in send-email.ts picks it up next tick and sends via SMTP with
// open/click tracking. Returns 'sent' here means "queued onto SMTP";
// the actual delivery+tracking is logged in crm_email_events.

import { supabase } from '../supabase.js'
import type { Channel, ChannelInput, ChannelResult } from './types.js'

export const emailChannel: Channel = {
  name: 'email',
  async send(input: ChannelInput): Promise<ChannelResult> {
    if (!input.toEmail) {
      return { status: 'skipped', error: 'lead has no email' }
    }
    const { data, error } = await supabase
      .from('crm_outreach_emails')
      .insert({
        lead_id: input.leadId,
        subject: input.subject ?? '(no subject)',
        body: input.body,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: 'sequence',
      })
      .select('id, tracking_id')
      .maybeSingle()
    if (error) {
      return { status: 'failed', error: error.message }
    }
    return {
      status: 'sent',
      metadata: {
        outreach_email_id: (data as { id: string } | null)?.id,
        tracking_id: (data as { tracking_id: string } | null)?.tracking_id,
      },
    }
  },
}
