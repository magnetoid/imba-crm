import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!url || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
}

export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export interface RuntimeSettings {
  imap_enabled: boolean
  imap_host: string
  imap_port: string
  imap_secure: boolean
  imap_username: string
  imap_folder: string
  imap_poll_seconds: number
  imap_last_uid: number
  pop3_enabled: boolean
  pop3_host: string
  pop3_port: string
  pop3_secure: boolean
  pop3_username: string
  pop3_leave_on_server: boolean
  pop3_last_uidl: string
}

export async function getRuntimeSettings(): Promise<RuntimeSettings | null> {
  const { data, error } = await supabase
    .from('crm_runtime_settings')
    .select('imap_enabled, imap_host, imap_port, imap_secure, imap_username, imap_folder, imap_poll_seconds, imap_last_uid, pop3_enabled, pop3_host, pop3_port, pop3_secure, pop3_username, pop3_leave_on_server, pop3_last_uidl')
    .eq('id', 1)
    .maybeSingle()
  if (error) {
    console.error(JSON.stringify({ msg: 'failed to load runtime settings', error: error.message }))
    return null
  }
  return data as RuntimeSettings | null
}

/**
 * Generic credential loader for any provider in crm_provider_credentials.
 * Used by integration channels (apify/hunter/apollo/browserbase/cal/...).
 * Returns a ProviderCredential the integration clients can pass straight
 * to runApifyActor / findEmail / etc.
 */
export async function loadProviderCredential(provider: string): Promise<{ apiKey: string; extra?: Record<string, unknown> } | null> {
  const { data, error } = await supabase
    .from('crm_provider_credentials')
    .select('api_key, extra')
    .eq('provider', provider)
    .maybeSingle()
  if (error) {
    console.error(JSON.stringify({ msg: 'failed to load provider credential', provider, error: error.message }))
    return null
  }
  const row = data as { api_key: string | null; extra: Record<string, unknown> | null } | null
  if (!row?.api_key) return null
  return { apiKey: row.api_key, extra: row.extra ?? undefined }
}

export async function getProviderSecret(provider: 'imap' | 'pop3' | 'smtp'): Promise<string | null> {
  // service_role can read crm_provider_credentials directly (RLS allows it)
  const { data, error } = await supabase
    .from('crm_provider_credentials')
    .select('api_key')
    .eq('provider', provider)
    .maybeSingle()
  if (error) {
    console.error(JSON.stringify({ msg: 'failed to read provider secret', provider, error: error.message }))
    return null
  }
  return (data as { api_key: string | null } | null)?.api_key ?? null
}

export async function updateImapCheckpoint(uid: number) {
  const { error } = await supabase
    .from('crm_runtime_settings')
    .update({ imap_last_uid: uid, imap_last_synced_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) console.error(JSON.stringify({ msg: 'failed to update imap checkpoint', error: error.message }))
}

export async function updatePop3Checkpoint(uidl: string) {
  const { error } = await supabase
    .from('crm_runtime_settings')
    .update({ pop3_last_uidl: uidl, pop3_last_synced_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) console.error(JSON.stringify({ msg: 'failed to update pop3 checkpoint', error: error.message }))
}

/** Marks a successful IMAP poll cycle and clears any previous error. */
export async function markImapSuccess() {
  await supabase
    .from('crm_runtime_settings')
    .update({
      imap_last_success_at: new Date().toISOString(),
      imap_last_error: null,
      imap_last_error_at: null,
    })
    .eq('id', 1)
}

/** Records an IMAP poll failure so the Settings UI can surface it. */
export async function markImapError(message: string) {
  await supabase
    .from('crm_runtime_settings')
    .update({
      imap_last_error: message.slice(0, 500),
      imap_last_error_at: new Date().toISOString(),
    })
    .eq('id', 1)
}

export async function markPop3Success() {
  await supabase
    .from('crm_runtime_settings')
    .update({
      pop3_last_success_at: new Date().toISOString(),
      pop3_last_error: null,
      pop3_last_error_at: null,
    })
    .eq('id', 1)
}

export async function markPop3Error(message: string) {
  await supabase
    .from('crm_runtime_settings')
    .update({
      pop3_last_error: message.slice(0, 500),
      pop3_last_error_at: new Date().toISOString(),
    })
    .eq('id', 1)
}

export interface IncomingMessage {
  from_email: string | null
  to_email: string | null
  cc:  string[] | null
  bcc: string[] | null
  subject: string | null
  body: string
  received_at: string
  metadata: Record<string, unknown>
}

// Skip-sender cache. Reloaded every minute so changes in
// crm_inbox_skip_senders propagate without a worker restart.
let skipSenderCache: { patterns: string[]; loadedAt: number } | null = null
const SKIP_CACHE_MS = 60_000
async function loadSkipSenders(): Promise<string[]> {
  const now = Date.now()
  if (skipSenderCache && now - skipSenderCache.loadedAt < SKIP_CACHE_MS) {
    return skipSenderCache.patterns
  }
  const { data } = await supabase.from('crm_inbox_skip_senders').select('pattern')
  const patterns = ((data ?? []) as Array<{ pattern: string }>)
    .map(r => r.pattern.toLowerCase())
  skipSenderCache = { patterns, loadedAt: now }
  return patterns
}

// Cache our own outbound domain — used to detect self-replies (mail
// that comes back to us from one of our own aliases / forwarders).
let selfDomainCache: { domain: string | null; loadedAt: number } | null = null
async function loadSelfDomain(): Promise<string | null> {
  const now = Date.now()
  if (selfDomainCache && now - selfDomainCache.loadedAt < SKIP_CACHE_MS) {
    return selfDomainCache.domain
  }
  const { data } = await supabase
    .from('crm_runtime_settings')
    .select('smtp_from_email')
    .eq('id', 1)
    .maybeSingle()
  const from = (data as { smtp_from_email: string | null } | null)?.smtp_from_email ?? null
  const at = from?.lastIndexOf('@') ?? -1
  const domain = at >= 0 && from ? from.slice(at + 1).toLowerCase() : null
  selfDomainCache = { domain, loadedAt: now }
  return domain
}

/** Inserts a new inbound row. Returns the row id so the caller can run
 *  AI categorization on it after the fact. */
export async function insertInboxMessage(m: IncomingMessage): Promise<string | null> {
  // Skip-sender check first (cheap, in-memory cache).
  if (m.from_email) {
    const lower = m.from_email.toLowerCase()
    const skips = await loadSkipSenders()
    if (skips.some(p => lower.includes(p))) {
      // Silently drop — newsletter / no-reply / bounce sender.
      return null
    }
  }

  // Try to attach to a known lead by sender email.
  let leadId: string | null = null
  if (m.from_email) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('email', m.from_email.toLowerCase())
      .maybeSingle()
    leadId = (lead as { id: string } | null)?.id ?? null
  }

  const { data, error } = await supabase
    .from('crm_inbox_messages')
    .insert({
      lead_id: leadId,
      direction: 'inbound',
      subject: m.subject,
      body: m.body,
      from_email: m.from_email,
      to_email: m.to_email,
      cc:  m.cc,
      bcc: m.bcc,
      status: 'unread',
      received_at: m.received_at,
      type: 'general',
      priority: 'normal',
      metadata: m.metadata,
    })
    .select('id')
    .maybeSingle()
  if (error) {
    // Unique-violation on the message_id index is expected during
    // re-polls / worker restarts and means we already have this email.
    // Postgres code 23505 = unique_violation.
    if ((error as { code?: string }).code === '23505') return null
    console.error(JSON.stringify({ msg: 'failed to insert inbox message', subject: m.subject, error: error.message }))
    return null
  }

  // Reply threading: if this inbound message belongs to a known lead,
  // mark the most recent unanswered outbound attempt as responded
  // (this also fires the hot-lead-alert trigger), tick the legacy
  // crm_outreach_emails.replied_at, and cancel any queued/scheduled
  // future steps so the sequence pauses.
  //
  // Skip threading when:
  //   1. The inbound is an auto-response (vacation responder, bounce,
  //      "we received your message" boilerplate). A vacation reply does
  //      not mean the prospect engaged.
  //   2. The from_email is on our own domain (self-loop — forwards,
  //      BCCs, mailbox aliases hitting our own inbox).
  if (leadId) {
    const isAuto = (m.metadata as { is_auto_reply?: boolean } | null | undefined)?.is_auto_reply === true
    const selfDomain = await loadSelfDomain()
    const fromDomain = m.from_email?.split('@')[1]?.toLowerCase()
    const isSelf = !!selfDomain && !!fromDomain && fromDomain === selfDomain
    if (!isAuto && !isSelf) {
      void threadInboundReply(leadId, m.received_at).catch(err =>
        console.error(JSON.stringify({ msg: 'reply threading failed', leadId, error: (err as Error).message })),
      )
    }
  }

  return (data as { id: string } | null)?.id ?? null
}

async function threadInboundReply(leadId: string, receivedAt: string) {
  // 1. Tick the most recent sent-but-unanswered outreach attempt.
  const { data: pending } = await supabase
    .from('crm_outreach_attempts')
    .select('id, sequence_id')
    .eq('lead_id', leadId)
    .is('responded_at', null)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const row = pending as { id: string; sequence_id: string | null } | null
  if (row) {
    await supabase
      .from('crm_outreach_attempts')
      .update({ responded_at: receivedAt })
      .eq('id', row.id)

    // 2. If the responded attempt is part of a sequence, cancel the
    // remaining queued/scheduled steps so the operator decides what
    // to do next instead of the sequence robot keeping pace.
    if (row.sequence_id) {
      await supabase
        .from('crm_outreach_attempts')
        .update({ status: 'cancelled' })
        .eq('lead_id', leadId)
        .eq('sequence_id', row.sequence_id)
        .in('status', ['queued'])
    }
  }

  // 3. Mark the legacy crm_outreach_emails as replied if any are still
  //    in the sent/opened state. This keeps the legacy email-only UI
  //    consistent with the new attempts model.
  await supabase
    .from('crm_outreach_emails')
    .update({ status: 'replied', replied_at: receivedAt })
    .eq('lead_id', leadId)
    .in('status', ['sent', 'opened'])
}

// Categories the AI categorizer can return that should land the
// message in the Spam tab. The operator can still recover it manually.
// "newsletter" + "promotional" are common edge cases that aren't true
// spam but also aren't worth seeing in the main Inbox.
const SPAM_CATEGORIES = new Set([
  'spam', 'promotional', 'newsletter', 'marketing', 'cold_outreach_blast',
])
function isSpamCategory(c: string | null | undefined): boolean {
  return !!c && SPAM_CATEGORIES.has(c.toLowerCase())
}

export async function updateInboxAI(
  id: string,
  ai: { ai_category: string; ai_sentiment: string; ai_suggested_reply: string },
) {
  const patch: Record<string, unknown> = { ...ai }
  if (isSpamCategory(ai.ai_category)) patch.is_spam = true
  const { error } = await supabase.from('crm_inbox_messages').update(patch).eq('id', id)
  if (error) console.error(JSON.stringify({ msg: 'failed to update inbox ai fields', id, error: error.message }))
}
