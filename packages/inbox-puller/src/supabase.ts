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
  subject: string | null
  body: string
  received_at: string
  metadata: Record<string, unknown>
}

/** Inserts a new inbound row. Returns the row id so the caller can run
 *  AI categorization on it after the fact. */
export async function insertInboxMessage(m: IncomingMessage): Promise<string | null> {
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
      status: 'unread',
      received_at: m.received_at,
      type: 'general',
      priority: 'normal',
      metadata: m.metadata,
    })
    .select('id')
    .maybeSingle()
  if (error) {
    console.error(JSON.stringify({ msg: 'failed to insert inbox message', subject: m.subject, error: error.message }))
    return null
  }
  return (data as { id: string } | null)?.id ?? null
}

export async function updateInboxAI(
  id: string,
  ai: { ai_category: string; ai_sentiment: string; ai_suggested_reply: string },
) {
  const { error } = await supabase.from('crm_inbox_messages').update(ai).eq('id', id)
  if (error) console.error(JSON.stringify({ msg: 'failed to update inbox ai fields', id, error: error.message }))
}
