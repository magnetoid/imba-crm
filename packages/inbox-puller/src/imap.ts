import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import {
  getProviderSecret,
  insertInboxMessage,
  updateImapCheckpoint,
  type RuntimeSettings,
} from './supabase.js'

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'imap', ...extra, time: new Date().toISOString() }))
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

      for (const item of items) {
        try {
          const parsed = await simpleParser(item.raw)
          const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase() ?? null
          const toFirst = Array.isArray(parsed.to)
            ? parsed.to[0]?.value?.[0]?.address ?? null
            : parsed.to?.value?.[0]?.address ?? null
          await insertInboxMessage({
            from_email: fromAddr,
            to_email: toFirst,
            subject: parsed.subject ?? null,
            body: parsed.text ?? parsed.html?.toString() ?? '',
            received_at: (parsed.date ?? item.internalDate ?? new Date()).toISOString(),
            metadata: {
              imap_uid: item.uid,
              message_id: parsed.messageId,
              has_attachments: (parsed.attachments?.length ?? 0) > 0,
              in_reply_to: parsed.inReplyTo,
              references: parsed.references,
            },
          })
          fetched++
          if (item.uid > lastUid) lastUid = item.uid
        } catch (err) {
          log('error', 'failed to parse/insert message', { uid: item.uid, error: (err as Error).message })
        }
      }
    } finally {
      lock.release()
    }
  } catch (err) {
    log('error', 'imap poll failed', { error: (err as Error).message })
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }

  if (fetched > 0) {
    await updateImapCheckpoint(lastUid)
    log('info', 'imap poll done', { fetched, last_uid: lastUid })
  }
}
