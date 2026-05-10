// Phase 10.5 — Deliverability instrumentation.
// Once per ~12h, fetch MailReach inbox status + latest placement test
// for each enrolled account, and cache the snapshot in
// crm_runtime_settings.smtp_inbox_health (jsonb).
//
// The Settings → Outbound mail tab reads the cached snapshot to surface
// warmup score + inbox/promo/spam %.

import { supabase, loadProviderCredential } from './supabase.js'
import { listMailReachInboxes, latestMailReachPlacement } from '@imba/shared/integrations'

const TWELVE_HOURS = 12 * 3600_000

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'deliverability', ...extra, time: new Date().toISOString() }))
}

async function getCheckpoint(): Promise<number> {
  const { data } = await supabase.from('crm_runtime_settings').select('smtp_inbox_health_at').eq('id', 1).maybeSingle()
  const row = data as { smtp_inbox_health_at: string | null } | null
  return row?.smtp_inbox_health_at ? new Date(row.smtp_inbox_health_at).getTime() : 0
}

export async function refreshMailReachHealth(): Promise<void> {
  const cred = await loadProviderCredential('mailreach')
  if (!cred?.apiKey) return  // silently skip if not configured

  if (Date.now() - (await getCheckpoint()) < TWELVE_HOURS) return

  try {
    const inboxes = await listMailReachInboxes(cred)
    const summaries: Record<string, unknown>[] = []
    for (const i of inboxes) {
      let placement = null
      try { placement = await latestMailReachPlacement(cred, i.id) }
      catch { /* skip individual placement failures */ }
      summaries.push({
        email: i.email,
        status: i.status,
        warmup_score: i.warmup_score,
        warmup_started_at: i.warmup_started_at,
        sender_score: i.reputation.sender_score,
        deliverability: i.reputation.deliverability,
        placement,
      })
    }
    await supabase.from('crm_runtime_settings').update({
      smtp_inbox_health: { inboxes: summaries, fetched_at: new Date().toISOString() },
      smtp_inbox_health_at: new Date().toISOString(),
    }).eq('id', 1)
    log('info', 'mailreach health refreshed', { inbox_count: summaries.length })
  } catch (err) {
    log('warn', 'mailreach refresh failed', { error: (err as Error).message })
  }
}
