// Outbound email worker — counterpart to imap.ts.
//
// Loops over crm_outreach_emails where status='approved' and sends each one
// via SMTP using the credentials in crm_provider_credentials (provider='smtp').
// On send: rewrites links + injects a tracking pixel so opens/clicks land in
// crm_email_events, then flips the row to status='sent' with sent_at = now().
// On failure: marks status='failed' with rejection_reason and bounced_at.

// Classify SMTP bounce strings into a small enum so the sender_health
// view can roll them up. Any RFC-3463 5.x.x permanent-failure code is
// 'hard'; 4.x.x is 'soft'; quota / mailbox-full is 'mailbox_full'.
function classifyBounce(s: string): string {
  if (/5\.\d\.\d|550|552|553|554/.test(s) || /mailbox.*not.*found|user.*unknown|recipient.*rejected/i.test(s)) return 'hard'
  if (/4\.\d\.\d|421|450|451/.test(s) || /try again later|temporary/i.test(s)) return 'soft'
  if (/mailbox.*full|over.*quota|message size exceeds/i.test(s)) return 'mailbox_full'
  if (/spam|blacklist|blocked|reputation/i.test(s)) return 'reputation'
  return 'other'
}

import nodemailer, { type Transporter } from 'nodemailer'
import { supabase, getProviderSecret, loadProviderCredential } from './supabase.js'
import { verifyEmail } from '@imba/shared/integrations/hunter'

const VERIFICATION_CACHE_DAYS = 30  // re-verify after this stale window

const TRACK_BASE = process.env.TRACK_BASE_URL || ''  // e.g. https://crm.imbaproduction.com

interface OutreachRow {
  id: string
  tracking_id: string
  lead_id: string
  subject: string
  body: string
  from_email: string | null
  in_reply_to: string | null
  email_references: string[] | null
  sent_message_id: string | null
}

// Deterministic Message-ID we control end-to-end. nodemailer will set
// this exact value into the SMTP envelope, so when the prospect replies,
// their In-Reply-To points at a value we have stored on the outreach row.
function buildMessageId(outreachId: string, domain: string): string {
  return `<outreach.${outreachId}@${domain}>`
}

// Derive a plausible Message-ID domain from the SMTP from-address. Falls
// back to imbaproduction.com if we can't extract it. Must NOT have angle
// brackets.
function extractDomain(emailAddr: string | null | undefined): string {
  if (!emailAddr) return 'imbaproduction.com'
  const at = emailAddr.lastIndexOf('@')
  if (at === -1 || at === emailAddr.length - 1) return 'imbaproduction.com'
  return emailAddr.slice(at + 1).trim().toLowerCase()
}

interface RuntimeMail {
  smtp_host: string
  smtp_port: string
  smtp_secure: boolean
  smtp_username: string
  smtp_from_name: string
  smtp_from_email: string
  smtp_auto_throttle: boolean
  smtp_max_bounce_rate_pct: number
}

interface SenderHealth {
  sender_domain: string
  total_30d: number
  sent_30d: number
  bounced_30d: number
  complained_30d: number
}

/** Returns the 30-day bounce rate (0..1) for the configured sender domain.
 *  Computed from crm_sender_health view (already exists per Phase 10.5).
 *  Returns null if there's no traffic in the window. */
async function getBounceRate(settings: RuntimeMail): Promise<{ rate: number; sent: number; bounced: number } | null> {
  const senderDomain = (settings.smtp_from_email || '').split('@')[1] || 'unknown'
  const { data } = await supabase
    .from('crm_sender_health')
    .select('sender_domain, total_30d, sent_30d, bounced_30d, complained_30d')
    .eq('sender_domain', senderDomain)
    .maybeSingle()
  const row = data as SenderHealth | null
  if (!row || (row.sent_30d ?? 0) < 20) return null   // not enough traffic to judge
  const rate = row.sent_30d > 0 ? row.bounced_30d / row.sent_30d : 0
  return { rate, sent: row.sent_30d, bounced: row.bounced_30d }
}

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'send-email', ...extra, time: new Date().toISOString() }))
}

async function loadMailSettings(): Promise<RuntimeMail | null> {
  const { data } = await supabase
    .from('crm_runtime_settings')
    .select('smtp_host, smtp_port, smtp_secure, smtp_username, smtp_from_name, smtp_from_email, smtp_auto_throttle, smtp_max_bounce_rate_pct')
    .eq('id', 1)
    .maybeSingle()
  return (data as RuntimeMail | null) ?? null
}

function buildTransport(s: RuntimeMail, password: string): Transporter {
  return nodemailer.createTransport({
    host: s.smtp_host,
    port: parseInt(s.smtp_port || '587', 10),
    secure: !!s.smtp_secure,
    auth: { user: s.smtp_username, pass: password },
  })
}

/** Wraps every <a href="..."> in the body so clicks land on /track/click/:id?u=... */
function rewriteLinks(html: string, trackingId: string): string {
  if (!TRACK_BASE) return html
  return html.replace(/<a\s+([^>]*?)href="([^"]+)"([^>]*)>/gi, (_full, pre, url, post) => {
    if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
      return `<a ${pre}href="${url}"${post}>`
    }
    const wrapped = `${TRACK_BASE}/track/click/${trackingId}?u=${encodeURIComponent(url)}`
    return `<a ${pre}href="${wrapped}"${post}>`
  })
}

function injectPixel(html: string, trackingId: string): string {
  if (!TRACK_BASE) return html
  const pixel = `<img src="${TRACK_BASE}/track/pixel/${trackingId}.gif" width="1" height="1" style="display:none" alt="" />`
  // Insert just before </body> if present, else append.
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${pixel}</body>`)
  return html + pixel
}

/** Render plain-text + HTML versions of the body. */
function renderBody(body: string, trackingId: string) {
  // The SPA stores `body` as either HTML or plain text. We send HTML always
  // (so the tracking pixel works) but also include a text alternative for
  // clients that prefer it. Detect HTML by presence of any tag.
  const looksHtml = /<[a-z][\s\S]*>/i.test(body)
  const html = looksHtml ? body : `<p>${body.replace(/\n/g, '<br/>')}</p>`
  const text = looksHtml ? body.replace(/<[^>]+>/g, '') : body
  return {
    html: injectPixel(rewriteLinks(html, trackingId), trackingId),
    text,
  }
}

async function getRecipientEmail(leadId: string): Promise<string | null> {
  const { data } = await supabase.from('crm_leads').select('email').eq('id', leadId).maybeSingle()
  return (data as { email: string | null } | null)?.email ?? null
}

interface VerificationResult {
  result: 'deliverable' | 'risky' | 'undeliverable' | 'unknown'
  score: number
  checked_at: string
  provider: string
}

/** Verify an email address via Hunter. Caches the result on
 *  crm_leads.email_verification so a sequence ticking the same lead 5
 *  times doesn't burn 5 verifications. Returns null when the verifier
 *  itself fails (creds missing, rate-limited) — caller decides whether
 *  to send anyway. */
async function verifyRecipient(leadId: string, email: string): Promise<VerificationResult | null> {
  // 1. Check the cache.
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('email_verification')
    .eq('id', leadId)
    .maybeSingle()
  const cached = (lead as { email_verification: VerificationResult | null } | null)?.email_verification ?? null
  if (cached) {
    const age = (Date.now() - new Date(cached.checked_at).getTime()) / (1000 * 60 * 60 * 24)
    if (age < VERIFICATION_CACHE_DAYS) return cached
  }
  // 2. Fresh check via Hunter.
  const cred = await loadProviderCredential('hunter')
  if (!cred?.apiKey) return null
  try {
    const res = await verifyEmail(cred, email)
    const result = (res.result === 'deliverable' || res.result === 'risky' || res.result === 'undeliverable')
      ? res.result
      : 'unknown'
    const verification: VerificationResult = {
      result,
      score: res.score ?? 0,
      checked_at: new Date().toISOString(),
      provider: 'hunter',
    }
    await supabase.from('crm_leads').update({ email_verification: verification }).eq('id', leadId)
    return verification
  } catch (err) {
    log('warn', 'pre-send verification failed', { lead_id: leadId, error: (err as Error).message })
    return null
  }
}

async function recordEvent(emailId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  await supabase.from('crm_email_events').insert({
    email_id: emailId,
    event_type: eventType,
    metadata,
  })
}

export async function pollOutreach() {
  // Pull a small batch each tick so a backlog drains gradually.
  const { data: rows, error } = await supabase
    .from('crm_outreach_emails')
    .select('id, tracking_id, lead_id, subject, body, from_email, in_reply_to, email_references, sent_message_id')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) {
    log('error', 'failed to load approved outreach', { error: error.message })
    return
  }
  if (!rows || rows.length === 0) return

  const settings = await loadMailSettings()
  if (!settings || !settings.smtp_host || !settings.smtp_username) {
    log('warn', 'approved outreach exists but SMTP not configured — skipping')
    return
  }
  const password = await getProviderSecret('smtp')
  if (!password) {
    log('warn', 'approved outreach exists but provider=smtp credential missing')
    return
  }

  // Sender-health auto-throttle: if our 30-day bounce rate is over the
  // configured ceiling, refuse to send anything until the rate decays.
  // Settings.smtp_auto_throttle defaults to true so this is opt-out, not
  // opt-in — burning sender reputation in production is irreversible.
  if (settings.smtp_auto_throttle !== false) {
    const health = await getBounceRate(settings)
    const ceiling = (settings.smtp_max_bounce_rate_pct ?? 5) / 100
    if (health && health.rate > ceiling) {
      log('warn', 'sender auto-throttled — bounce rate over ceiling', {
        rate_pct: (health.rate * 100).toFixed(2),
        ceiling_pct: (ceiling * 100).toFixed(2),
        sent_30d: health.sent,
        bounced_30d: health.bounced,
      })
      return
    }
  }

  const transport = buildTransport(settings, password)
  // Verify once per batch so we fail fast if creds are wrong.
  try {
    await transport.verify()
  } catch (err) {
    log('error', 'smtp verify failed; will retry next cycle', { error: (err as Error).message })
    return
  }

  for (const row of rows as OutreachRow[]) {
    const recipient = await getRecipientEmail(row.lead_id)
    if (!recipient) {
      log('warn', 'lead has no email; skipping', { id: row.id, lead_id: row.lead_id })
      continue
    }

    // ── Pre-send verification (Hunter). Refuse to send if the address
    // is known-undeliverable — protects sender reputation. risky/unknown
    // get through with a warning. If verification itself fails (e.g.
    // Hunter creds missing) we let the send proceed; that's a config
    // problem, not a deliverability problem.
    const verification = await verifyRecipient(row.lead_id, recipient)
    if (verification?.result === 'undeliverable') {
      await supabase.from('crm_outreach_emails')
        .update({
          status: 'failed',
          rejection_reason: 'preflight_verification_failed',
          bounce_reason: 'preflight_undeliverable',
          last_error: `Hunter verification said undeliverable (score ${verification.score})`,
          last_error_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      log('warn', 'pre-send verification failed; skipping', {
        id: row.id, to: recipient, score: verification.score,
      })
      continue
    }
    if (verification?.result === 'risky') {
      log('info', 'pre-send verification: risky address (sending anyway)', {
        id: row.id, to: recipient, score: verification.score,
      })
    }
    const fromAddr = row.from_email || settings.smtp_from_email || settings.smtp_username
    const fromHeader = settings.smtp_from_name
      ? `"${settings.smtp_from_name}" <${fromAddr}>`
      : fromAddr
    const { html, text } = renderBody(row.body, row.tracking_id)

    // ── RFC 5322 threading headers ────────────────────────────────────
    // - Message-ID: deterministic, lets us match the prospect's reply later.
    // - In-Reply-To + References: chain the reply tree if this email is
    //   itself a reply (the SPA composer or inbox-replier set these).
    // - Auto-Submitted + X-Auto-Response-Suppress: tell other inboxes
    //   "this is a system reply" so they don't loop their auto-responders
    //   into us.
    const msgIdDomain = extractDomain(fromAddr)
    const messageId = buildMessageId(row.id, msgIdDomain)
    const headers: Record<string, string> = {
      'X-Imba-Tracking-Id': row.tracking_id,
      'Auto-Submitted': 'auto-replied',
      'X-Auto-Response-Suppress': 'All',
    }
    if (row.in_reply_to) headers['In-Reply-To'] = row.in_reply_to
    if (row.email_references && row.email_references.length > 0) {
      headers['References'] = row.email_references.join(' ')
    }

    try {
      const info = await transport.sendMail({
        from: fromHeader,
        to: recipient,
        subject: row.subject,
        html,
        text,
        messageId,
        headers,
      })
      await supabase.from('crm_outreach_emails')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_message_id: messageId,
        })
        .eq('id', row.id)
      // Mirror the Message-ID into the matching crm_inbox_messages outbound
      // row (if the SPA created one) so the thread_key + reply matching
      // can find it. We match on (lead_id, tracking_id) via metadata, but
      // tracking_id isn't always on the inbox mirror — fall back to a
      // recent outbound for this lead with a NULL message_id.
      await supabase.from('crm_inbox_messages')
        .update({ metadata: { message_id: messageId, in_reply_to: row.in_reply_to, references: row.email_references } })
        .eq('lead_id', row.lead_id)
        .eq('direction', 'outbound')
        .is('metadata->>message_id', null)
        .gte('received_at', new Date(Date.now() - 5 * 60_000).toISOString())
      await recordEvent(row.id, 'sent', {
        message_id: messageId,
        smtp_message_id: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
      })
      log('info', 'email sent', { id: row.id, to: recipient, message_id: messageId })
    } catch (err) {
      const message = (err as Error).message
      const reason = classifyBounce(message)
      await supabase.from('crm_outreach_emails')
        .update({
          status: 'failed',
          rejection_reason: message.slice(0, 500),
          bounce_reason: reason,
          last_error: message.slice(0, 500),
          last_error_at: new Date().toISOString(),
          bounced_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      await recordEvent(row.id, 'send_failed', { error: message, bounce_reason: reason })
      log('error', 'email send failed', { id: row.id, to: recipient, error: message, bounce_reason: reason })
    }
  }
}
