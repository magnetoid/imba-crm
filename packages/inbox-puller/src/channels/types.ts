// Channel handler framework. Each outbound channel (email, contact_form,
// linkedin_dm, sms, ...) implements the same interface so the dispatch
// loop and the agent runtime can call them uniformly.

export interface ChannelInput {
  attemptId: string
  leadId: string
  /** crm_leads.email if known. */
  toEmail: string | null
  /** crm_leads.name (display name on the recipient end). */
  toName: string | null
  /** crm_companies.domain — useful for contact-form / DOM-based channels. */
  companyDomain: string | null
  /** Subject line. Channels that don't need it ignore it. */
  subject: string | null
  /** Body the AI drafted (or operator approved). HTML or plain text — the
   *  channel decides how to render. */
  body: string
  /** Lead's LinkedIn URL when available (used by linkedin_dm). */
  linkedinUrl: string | null
  /** Free-form metadata copied onto the resulting attempt row. */
  metadata: Record<string, unknown>
}

export type ChannelStatus = 'sent' | 'failed' | 'skipped'

export interface ChannelResult {
  status: ChannelStatus
  /** Free-form details the channel wants persisted on the attempt row. */
  metadata?: Record<string, unknown>
  /** Short reason for failed/skipped (saved to crm_outreach_attempts.error). */
  error?: string
}

export interface Channel {
  name: 'email' | 'contact_form' | 'linkedin_dm' | 'sms' | 'call' | 'manual'
  send(input: ChannelInput): Promise<ChannelResult>
}
