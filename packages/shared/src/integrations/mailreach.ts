// MailReach — email warmup-as-a-service. We use it to:
//   1. enroll the operator's outbound inboxes for warmup
//   2. fetch a "warmup score" (0-100) the SPA surfaces in Settings
//   3. fetch inbox-placement test results (% in inbox/promo/spam)
//
// Pure HTTP wrapper — caller passes ProviderCredential.
// API docs: https://app.mailreach.co/api-docs

import { IntegrationError } from './_creds'
import type { ProviderCredential } from './_creds'

const MAILREACH_BASE = 'https://api.mailreach.co/api/v1'

export interface MailReachInbox {
  id: number
  email: string
  status: string
  warmup_score: number | null
  warmup_started_at: string | null
  reputation: { sender_score?: number | null; deliverability?: number | null }
}

export async function listInboxes(cred: ProviderCredential): Promise<MailReachInbox[]> {
  if (!cred.apiKey) throw new IntegrationError('mailreach', 'no API key')
  const res = await fetch(`${MAILREACH_BASE}/email_accounts`, {
    headers: { Authorization: `Bearer ${cred.apiKey}`, accept: 'application/json' },
  })
  if (!res.ok) throw new IntegrationError('mailreach', `list failed: ${await res.text()}`, res.status)
  const json = await res.json() as { data?: Array<{
    id: number
    email: string
    status?: string
    warmup_score?: number | null
    warmup_started_at?: string | null
    sender_score?: number | null
    deliverability?: number | null
  }> }
  return (json.data ?? []).map(r => ({
    id: r.id,
    email: r.email,
    status: r.status ?? 'unknown',
    warmup_score: r.warmup_score ?? null,
    warmup_started_at: r.warmup_started_at ?? null,
    reputation: { sender_score: r.sender_score ?? null, deliverability: r.deliverability ?? null },
  }))
}

export interface MailReachPlacement {
  inbox_pct: number
  promotions_pct: number
  spam_pct: number
  measured_at: string
}

export async function latestPlacement(cred: ProviderCredential, accountId: number): Promise<MailReachPlacement | null> {
  if (!cred.apiKey) throw new IntegrationError('mailreach', 'no API key')
  const res = await fetch(`${MAILREACH_BASE}/email_accounts/${accountId}/placements/latest`, {
    headers: { Authorization: `Bearer ${cred.apiKey}`, accept: 'application/json' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new IntegrationError('mailreach', `placement failed: ${await res.text()}`, res.status)
  const json = await res.json() as { inbox_pct?: number; promotions_pct?: number; spam_pct?: number; measured_at?: string }
  return {
    inbox_pct:       json.inbox_pct       ?? 0,
    promotions_pct:  json.promotions_pct  ?? 0,
    spam_pct:        json.spam_pct        ?? 0,
    measured_at:     json.measured_at     ?? new Date().toISOString(),
  }
}
