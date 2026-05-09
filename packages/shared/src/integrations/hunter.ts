// Hunter.io email finder + verifier. https://hunter.io/api-documentation/v2
import { getProviderCredential, IntegrationError } from './_creds'

const BASE = 'https://api.hunter.io/v2'

export interface FoundEmail {
  email: string
  score: number               // 0-100 confidence
  position?: string
  seniority?: string
  twitter?: string
  linkedin?: string
  verification?: { status: string; result: string }
}

export async function findEmail(opts: {
  domain: string
  firstName?: string
  lastName?: string
  fullName?: string
}): Promise<FoundEmail | null> {
  const { apiKey } = await getProviderCredential('hunter')
  if (!apiKey) throw new IntegrationError('hunter', 'no API key configured')
  const params = new URLSearchParams({ domain: opts.domain, api_key: apiKey })
  if (opts.firstName) params.set('first_name', opts.firstName)
  if (opts.lastName)  params.set('last_name',  opts.lastName)
  if (opts.fullName)  params.set('full_name',  opts.fullName)

  const r = await fetch(`${BASE}/email-finder?${params}`)
  if (!r.ok) {
    if (r.status === 404 || r.status === 422) return null
    throw new IntegrationError('hunter', await r.text(), r.status)
  }
  const j = await r.json() as { data?: { email?: string; score?: number; position?: string; seniority?: string; twitter?: string; linkedin?: string; verification?: { status: string; result: string } } }
  if (!j.data?.email) return null
  return {
    email: j.data.email,
    score: j.data.score ?? 0,
    position: j.data.position,
    seniority: j.data.seniority,
    twitter: j.data.twitter,
    linkedin: j.data.linkedin,
    verification: j.data.verification,
  }
}

export async function verifyEmail(email: string): Promise<{
  status: string
  result: string
  score: number
}> {
  const { apiKey } = await getProviderCredential('hunter')
  if (!apiKey) throw new IntegrationError('hunter', 'no API key configured')
  const r = await fetch(`${BASE}/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`)
  if (!r.ok) throw new IntegrationError('hunter', await r.text(), r.status)
  const j = await r.json() as { data: { status: string; result: string; score: number } }
  return j.data
}
