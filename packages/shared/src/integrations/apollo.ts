// Apollo.io people + org enrichment. https://apolloapi.com/docs
import { IntegrationError, type ProviderCredential } from './_creds'

const BASE = 'https://api.apollo.io/api/v1'

export interface ApolloPerson {
  id?: string
  name?: string
  first_name?: string
  last_name?: string
  email?: string
  title?: string
  seniority?: string
  linkedin_url?: string
  phone_numbers?: Array<{ raw_number: string; type: string }>
  organization?: {
    id?: string
    name?: string
    website_url?: string
    industry?: string
    estimated_num_employees?: number
    country?: string
  }
}

export async function enrichPerson(
  cred: ProviderCredential,
  opts: {
    email?: string; firstName?: string; lastName?: string;
    domain?: string; linkedinUrl?: string; reveal_phone?: boolean
  },
): Promise<ApolloPerson | null> {
  if (!cred.apiKey) throw new IntegrationError('apollo', 'no API key')

  const body: Record<string, unknown> = {}
  if (opts.email)        body.email          = opts.email
  if (opts.firstName)    body.first_name     = opts.firstName
  if (opts.lastName)     body.last_name      = opts.lastName
  if (opts.domain)       body.domain         = opts.domain
  if (opts.linkedinUrl)  body.linkedin_url   = opts.linkedinUrl
  if (opts.reveal_phone) body.reveal_phone_number = true

  const r = await fetch(`${BASE}/people/match`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cred.apiKey,
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    if (r.status === 404 || r.status === 422) return null
    throw new IntegrationError('apollo', await r.text(), r.status)
  }
  const j = await r.json() as { person?: ApolloPerson }
  return j.person ?? null
}
