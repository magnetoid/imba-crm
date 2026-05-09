// Browserbase — managed headless browser sessions. We don't use the
// Stagehand SDK directly here (it pulls in Playwright); instead we expose
// a thin "create session + return connect URL" client. The agent-runner
// inside the worker imports Stagehand lazily, connects to the session
// using this URL, and runs its `act()` / `extract()` / `observe()` calls.
// https://docs.browserbase.com

import { getProviderCredential, IntegrationError } from './_creds'

const BASE = 'https://api.browserbase.com/v1'

export interface BrowserbaseSession {
  id: string
  connectUrl: string
  /** Browser CDP URL — what Stagehand connects over. */
  cdpUrl?: string
  status: string
  createdAt: string
  expiresAt: string
}

/** Create a fresh anti-detection session. Stagehand connects to it.
 *  The session auto-closes when idle for 30s by default. */
export async function createSession(opts?: {
  /** Stealth mode; recommended for LinkedIn / contact-form filling. */
  proxy?: boolean
  /** ISO country code; defaults to project default. */
  geolocation?: string
}): Promise<BrowserbaseSession> {
  const { apiKey, extra } = await getProviderCredential('browserbase')
  if (!apiKey) throw new IntegrationError('browserbase', 'no API key configured')
  const projectId = (extra?.project_id as string | undefined) ?? ''
  if (!projectId) throw new IntegrationError('browserbase', 'extra.project_id missing in crm_provider_credentials')

  const r = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: {
      'x-bb-api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      proxies: opts?.proxy ?? true,
      browserSettings: opts?.geolocation
        ? { geolocation: { country: opts.geolocation } }
        : undefined,
    }),
  })
  if (!r.ok) throw new IntegrationError('browserbase', await r.text(), r.status)
  const j = await r.json() as {
    id: string
    connectUrl?: string
    status: string
    createdAt: string
    expiresAt: string
  }
  return {
    id: j.id,
    connectUrl: j.connectUrl ?? `${BASE}/sessions/${j.id}/debug`,
    status: j.status,
    createdAt: j.createdAt,
    expiresAt: j.expiresAt,
  }
}

export async function endSession(sessionId: string): Promise<void> {
  const { apiKey } = await getProviderCredential('browserbase')
  if (!apiKey) return
  await fetch(`${BASE}/sessions/${sessionId}`, {
    method: 'POST',
    headers: { 'x-bb-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'REQUEST_RELEASE' }),
  }).catch(() => { /* swallow — best effort */ })
}
