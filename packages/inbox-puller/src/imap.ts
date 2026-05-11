import { ImapFlow } from 'imapflow'
import { simpleParser, type Attachment } from 'mailparser'
import {
  getProviderSecret,
  insertInboxMessage,
  updateImapCheckpoint,
  updateInboxAI,
  markImapSuccess,
  markImapError,
  supabase,
  type RuntimeSettings,
} from './supabase.js'
import { categorizeInboundMessage, getAISettings } from './ai.js'

const ATTACHMENT_BUCKET = 'inbox-attachments'
const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024  // matches the bucket file_size_limit

interface StoredAttachment {
  filename: string
  size_bytes: number
  mime: string
  storage_path: string
}

/**
 * Upload mailparser attachments to Supabase Storage. Keyed by IMAP UID
 * so re-polls don't collide. Returns the metadata array we persist on
 * crm_inbox_messages.metadata.attachments.
 *
 * Skips attachments larger than 25 MB (bucket limit) and inline images
 * referenced via cid: (those are already in the HTML body).
 */
async function uploadAttachments(uid: number, parts: Attachment[] | undefined): Promise<StoredAttachment[]> {
  if (!parts || parts.length === 0) return []
  const out: StoredAttachment[] = []
  for (const part of parts) {
    const isInline = part.contentDisposition === 'inline' && !!part.cid
    if (isInline) continue
    const buf = part.content as Buffer
    if (!buf || buf.length === 0) continue
    if (buf.length > ATTACHMENT_MAX_BYTES) continue
    const safeName = (part.filename ?? `attachment-${out.length + 1}.bin`).replace(/[^\w.\-]/g, '_').slice(0, 200)
    const path = `${uid}/${Date.now()}_${out.length}_${safeName}`
    const { error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, buf, { contentType: part.contentType ?? 'application/octet-stream', upsert: false })
    if (error) continue   // best-effort — don't drop the message because of an upload failure
    out.push({
      filename: safeName,
      size_bytes: buf.length,
      mime: part.contentType ?? 'application/octet-stream',
      storage_path: path,
    })
  }
  return out
}

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'imap', ...extra, time: new Date().toISOString() }))
}

// Minimal HTML→text fallback for inbound mail without a text/plain part.
// We don't need full fidelity — the operator reads this in a chat-like UI.
// Strip scripts/styles, replace block tags with newlines, drop everything
// else, decode the common HTML entities, collapse whitespace.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<(br|p|div|li|tr|h[1-6])[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x?[0-9a-f]+;/gi, '') // drop other numeric entities
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Block IMAP folders that are NOT inbox-shaped — if the operator
// misconfigures the folder name, every sent/draft/trash row would be
// ingested as inbound, polluting the CRM in seconds. Better to fail loud.
const BAD_FOLDER_RE = /(sent|draft|trash|spam|junk|deleted|archive|outbox)/i

// AI-categorize failure tracking — coalesce rate-limited storms so we
// don't fill the worker log with a million identical lines.
let lastAiErrorLogAt = 0
let aiErrorCount = 0
function logAiCategorizeError(err: unknown) {
  aiErrorCount++
  const now = Date.now()
  if (now - lastAiErrorLogAt < 60_000) return
  log('warn', 'ai categorize failed', {
    error: (err as Error).message,
    suppressed_in_last_minute: aiErrorCount - 1,
  })
  lastAiErrorLogAt = now
  aiErrorCount = 0
}

export async function pollImap(settings: RuntimeSettings) {
  if (!settings.imap_enabled) return
  if (!settings.imap_host || !settings.imap_username) {
    log('warn', 'imap enabled but host/username missing')
    return
  }
  const password = await getProviderSecret('imap')
  if (!password) {
    log('warn', 'imap enabled but no provider credential set (provider=imap in crm_provider_credentials)')
    return
  }

  const port = parseInt(settings.imap_port || '993', 10)
  const client = new ImapFlow({
    host: settings.imap_host,
    port,
    secure: !!settings.imap_secure,
    auth: { user: settings.imap_username, pass: password },
    logger: false,
  })

  let fetched = 0
  let lastUid = settings.imap_last_uid || 0

  try {
    await client.connect()
    const folder = settings.imap_folder || 'INBOX'
    if (BAD_FOLDER_RE.test(folder)) {
      log('error', 'refusing to poll non-inbox folder', { folder })
      await markImapError(`Refusing to poll '${folder}' — must be an inbox-shaped folder, not Sent/Draft/Trash/etc.`)
      return
    }
    const lock = await client.getMailboxLock(folder)
    try {
      // First-time sync (last_uid=0): fetch only the most recent 50 messages,
      // not the entire mailbox. After that, we use UID-greater-than.
      const range = lastUid === 0 ? '1:*' : `${lastUid + 1}:*`
      const fetchOpts = { uid: true, envelope: true, source: true, internalDate: true }

      // Collect messages first so we don't keep the lock during DB inserts.
      const items: { uid: number; raw: Buffer; internalDate?: Date }[] = []
      for await (const message of client.fetch(range, fetchOpts, { uid: true })) {
        if (lastUid === 0 && items.length >= 50) break // bound first run
        const src = (message as { source?: Buffer }).source
        if (!src) continue
        items.push({
          uid: message.uid,
          raw: src,
          internalDate: (message as { internalDate?: Date }).internalDate,
        })
      }

      // Look up the AI auto-categorize toggle once per poll, not per message.
      const aiSettings = await getAISettings()
      const wantsAI = !!aiSettings?.ai_inbox_auto_categorize

      for (const item of items) {
        try {
          const parsed = await simpleParser(item.raw)
          const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase() ?? null
          const toFirst = Array.isArray(parsed.to)
            ? parsed.to[0]?.value?.[0]?.address ?? null
            : parsed.to?.value?.[0]?.address ?? null
          const subject = parsed.subject ?? null
          // Prefer text/plain. If absent, derive plain text from the HTML
          // part. Falls back to mailparser's textAsHtml-derived text if
          // present (which is a server-side render of the html).
          let body = parsed.text ?? ''
          if (!body && parsed.html) {
            body = htmlToText(typeof parsed.html === 'string' ? parsed.html : parsed.html.toString())
          }

          // ── Auto-response detection (RFC 3834 + de-facto standards).
          // Headers we honor:
          //   Auto-Submitted:           anything other than "no" means auto
          //   Precedence:               "bulk" / "list" / "auto_reply"
          //   X-Auto-Response-Suppress: presence → originator wants no reply
          //   X-Autoreply / X-Autorespond / X-Autoresponder: any value → auto
          // We don't drop the row (the operator may want to see the
          // out-of-office message); we just tag it so threadInboundReply
          // doesn't tick responded_at and the inbox-replier doesn't loop.
          const headers = parsed.headers
          const hdr = (k: string): string | null => {
            const v = headers?.get(k)
            if (!v) return null
            if (typeof v === 'string') return v.toLowerCase()
            // mailparser sometimes returns an object — coerce defensively.
            try { return JSON.stringify(v).toLowerCase() } catch { return null }
          }
          const autoSubmitted = hdr('auto-submitted')
          const precedence = hdr('precedence')
          const isAutoReply =
            (autoSubmitted && autoSubmitted !== 'no') ||
            (precedence && /(bulk|list|auto_reply|junk)/.test(precedence)) ||
            !!hdr('x-auto-response-suppress') ||
            !!hdr('x-autoreply') ||
            !!hdr('x-autorespond') ||
            !!hdr('x-autoresponder')

          // Upload attachments BEFORE the insert so the metadata array
          // already has storage_path entries — single source of truth.
          const storedAttachments = await uploadAttachments(item.uid, parsed.attachments)

          const insertedId = await insertInboxMessage({
            from_email: fromAddr,
            to_email: toFirst,
            subject,
            body,
            received_at: (parsed.date ?? item.internalDate ?? new Date()).toISOString(),
            metadata: {
              imap_uid: item.uid,
              message_id: parsed.messageId,
              has_attachments: storedAttachments.length > 0,
              attachments: storedAttachments,
              in_reply_to: parsed.inReplyTo,
              references: parsed.references,
              is_auto_reply: !!isAutoReply,
              auto_submitted: autoSubmitted ?? undefined,
              precedence: precedence ?? undefined,
            },
          })
          fetched++
          if (item.uid > lastUid) lastUid = item.uid

          // Best-effort AI categorize: don't let a slow/failed AI call
          // block the next message — fire-and-forget. Skip auto-replies
          // (no value in AI-categorizing a vacation responder).
          if (insertedId && wantsAI && !isAutoReply) {
            void categorizeInboundMessage({ from_email: fromAddr, subject, body }).then(ai => {
              if (ai && insertedId) {
                void updateInboxAI(insertedId, {
                  ai_category: ai.category,
                  ai_sentiment: ai.sentiment,
                  ai_suggested_reply: ai.suggested_reply,
                })
              }
            }).catch(logAiCategorizeError)
          }
        } catch (err) {
          log('error', 'failed to parse/insert message', { uid: item.uid, error: (err as Error).message })
        }
      }
    } finally {
      lock.release()
    }
    await markImapSuccess()
  } catch (err) {
    const message = (err as Error).message
    log('error', 'imap poll failed', { error: message })
    await markImapError(message)
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }

  if (fetched > 0) {
    await updateImapCheckpoint(lastUid)
    log('info', 'imap poll done', { fetched, last_uid: lastUid })
  }
}
