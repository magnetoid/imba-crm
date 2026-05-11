import Pop3Command from 'node-pop3'
import { simpleParser } from 'mailparser'
import {
  getProviderSecret,
  insertInboxMessage,
  updatePop3Checkpoint,
  updateInboxAI,
  markPop3Success,
  markPop3Error,
  type RuntimeSettings,
} from './supabase.js'
import { categorizeInboundMessage, getAISettings } from './ai.js'

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'pop3', ...extra, time: new Date().toISOString() }))
}

export async function pollPop3(settings: RuntimeSettings) {
  if (!settings.pop3_enabled) return
  if (!settings.pop3_host || !settings.pop3_username) {
    log('warn', 'pop3 enabled but host/username missing')
    return
  }
  const password = await getProviderSecret('pop3')
  if (!password) {
    log('warn', 'pop3 enabled but no provider credential set (provider=pop3 in crm_provider_credentials)')
    return
  }

  const port = parseInt(settings.pop3_port || '995', 10)
  const client = new Pop3Command({
    host: settings.pop3_host,
    port,
    user: settings.pop3_username,
    password,
    tls: !!settings.pop3_secure,
    timeout: 30000,
  })

  const seen = new Set((settings.pop3_last_uidl || '').split(',').filter(Boolean))
  let highWaterMark = settings.pop3_last_uidl || ''
  let fetched = 0
  const newSeen: string[] = []

  try {
    await client.connect()
    const aiSettings = await getAISettings()
    const wantsAI = !!aiSettings?.ai_inbox_auto_categorize
    const uidlList = (await client.UIDL()) as Array<[string, string]> // [[msgno, uidl], ...]
    for (const [msgnoStr, uidl] of uidlList) {
      if (seen.has(uidl)) continue
      const msgno = Number(msgnoStr)
      try {
        const raw = await client.RETR(msgno)
        const parsed = await simpleParser(raw)
        const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase() ?? null
        const toFirst = Array.isArray(parsed.to)
          ? parsed.to[0]?.value?.[0]?.address ?? null
          : parsed.to?.value?.[0]?.address ?? null
        const flattenAddresses = (a: unknown): string[] => {
          if (!a) return []
          const arr = Array.isArray(a) ? a : [a]
          const out: string[] = []
          for (const it of arr) {
            const vals = (it as { value?: Array<{ address?: string }> })?.value ?? []
            for (const v of vals) if (v.address) out.push(v.address.toLowerCase())
          }
          return out
        }
        const cc  = flattenAddresses(parsed.cc)
        const bcc = flattenAddresses(parsed.bcc)
        const subject = parsed.subject ?? null
        const body = parsed.text ?? parsed.html?.toString() ?? ''
        const insertedId = await insertInboxMessage({
          from_email: fromAddr,
          to_email: toFirst,
          cc:  cc.length > 0 ? cc : null,
          bcc: bcc.length > 0 ? bcc : null,
          subject,
          body,
          received_at: (parsed.date ?? new Date()).toISOString(),
          metadata: {
            pop3_uidl: uidl,
            message_id: parsed.messageId,
            has_attachments: (parsed.attachments?.length ?? 0) > 0,
          },
        })
        fetched++
        newSeen.push(uidl)
        if (!settings.pop3_leave_on_server) {
          await client.DELE(msgno)
        }
        if (insertedId && wantsAI) {
          void categorizeInboundMessage({ from_email: fromAddr, subject, body }).then(ai => {
            if (ai && insertedId) {
              void updateInboxAI(insertedId, {
                ai_category: ai.category,
                ai_sentiment: ai.sentiment,
                ai_suggested_reply: ai.suggested_reply,
              })
            }
          }).catch(() => { /* swallow */ })
        }
      } catch (err) {
        log('error', 'failed to parse/insert pop3 message', { uidl, error: (err as Error).message })
      }
    }

    // Keep the most recent N UIDLs in our checkpoint (cap to 500 so the column doesn't grow unbounded).
    if (newSeen.length > 0) {
      const all = [...newSeen, ...Array.from(seen)].slice(0, 500)
      highWaterMark = all.join(',')
    }
    await markPop3Success()
  } catch (err) {
    const message = (err as Error).message
    log('error', 'pop3 poll failed', { error: message })
    await markPop3Error(message)
  } finally {
    try { await client.QUIT() } catch { /* ignore */ }
  }

  if (fetched > 0) {
    await updatePop3Checkpoint(highWaterMark)
    log('info', 'pop3 poll done', { fetched })
  }
}
