// Browserbase — managed headless browser sessions. Thin REST wrapper;
// Stagehand connects to the returned CDP URL when the worker actually
// runs a browser action.
// https://docs.browserbase.com

import { IntegrationError, type ProviderCredential } from './_creds'

const BASE = 'https://api.browserbase.com/v1'

export interface BrowserbaseSession {
  id: string
  connectUrl: string
  cdpUrl?: string
  status: string
  createdAt: string
  expiresAt: string
}

export async function createSession(
  cred: ProviderCredential,
  opts?: { proxy?: boolean; geolocation?: string },
): Promise<BrowserbaseSession> {
  if (!cred.apiKey) throw new IntegrationError('browserbase', 'no API key')
  const projectId = (cred.extra?.project_id as string | undefined) ?? ''
  if (!projectId) throw new IntegrationError('browserbase', 'extra.project_id missing')

  const r = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'x-bb-api-key': cred.apiKey, 'content-type': 'application/json' },
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

export async function endSession(cred: ProviderCredential, sessionId: string): Promise<void> {
  if (!cred.apiKey) return
  await fetch(`${BASE}/sessions/${sessionId}`, {
    method: 'POST',
    headers: { 'x-bb-api-key': cred.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'REQUEST_RELEASE' }),
  }).catch(() => { /* swallow — best effort */ })
}
