// Apify wrapper — runs an actor, polls until it finishes, returns the
// dataset. https://docs.apify.com/api/v2

import { IntegrationError, type ProviderCredential } from './_creds'

const APIFY_BASE = 'https://api.apify.com/v2'

export interface ApifyRunOptions {
  actorId: string
  input: Record<string, unknown>
  maxItems?: number
  timeoutSeconds?: number
}

export type ApifyRunStatus =
  | 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  | 'TIMED-OUT' | 'ABORTED' | 'ABORTING'

export interface ApifyRunResult<T = Record<string, unknown>> {
  runId: string
  status: ApifyRunStatus
  items: T[]
  defaultDatasetId: string
}

export async function runApifyActor<T = Record<string, unknown>>(
  cred: ProviderCredential,
  opts: ApifyRunOptions,
): Promise<ApifyRunResult<T>> {
  if (!cred.apiKey) throw new IntegrationError('apify', 'no API key')
  const actorPath = opts.actorId.replace('/', '~')
  const startRes = await fetch(`${APIFY_BASE}/acts/${actorPath}/runs?token=${cred.apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts.input ?? {}),
  })
  if (!startRes.ok) {
    throw new IntegrationError('apify', `start failed: ${await startRes.text()}`, startRes.status)
  }
  const startJson = await startRes.json() as { data: { id: string; defaultDatasetId: string } }
  const runId = startJson.data.id
  const datasetId = startJson.data.defaultDatasetId

  const deadline = Date.now() + (opts.timeoutSeconds ?? 300) * 1000
  let status: ApifyRunStatus = 'RUNNING'
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000))
    const r = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${cred.apiKey}`)
    if (!r.ok) continue
    const j = await r.json() as { data: { status: string } }
    status = j.data.status as ApifyRunStatus
    if (status !== 'RUNNING' && status !== 'READY') break
  }

  const items: T[] = []
  const limit = Math.min(1000, opts.maxItems ?? 1000)
  const itemsRes = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${cred.apiKey}&limit=${limit}&clean=true`)
  if (itemsRes.ok) {
    const arr = await itemsRes.json() as T[]
    if (Array.isArray(arr)) items.push(...arr)
  }

  return { runId, status, items, defaultDatasetId: datasetId }
}
