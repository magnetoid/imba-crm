// Cal.com REST API. https://cal.com/docs/api-reference
import { getProviderCredential, IntegrationError } from './_creds'

const BASE = 'https://api.cal.com/v2'

export interface CalSlot {
  start: string  // ISO
  end: string
}

/** List free slots for a given event type over the next N days. */
export async function findSlots(opts: {
  eventTypeId: string | number
  daysAhead?: number
  durationMinutes?: number
}): Promise<CalSlot[]> {
  const { apiKey } = await getProviderCredential('cal')
  if (!apiKey) throw new IntegrationError('cal', 'no API key configured')
  const days = opts.daysAhead ?? 7
  const start = new Date().toISOString().slice(0, 10)
  const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const params = new URLSearchParams({
    eventTypeId: String(opts.eventTypeId),
    startTime: start,
    endTime: end,
  })
  const r = await fetch(`${BASE}/slots/available?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!r.ok) throw new IntegrationError('cal', await r.text(), r.status)
  const j = await r.json() as { data?: { slots?: Record<string, Array<{ time: string }>> } }
  const out: CalSlot[] = []
  for (const day of Object.values(j.data?.slots ?? {})) {
    for (const s of day) {
      out.push({
        start: s.time,
        end: new Date(new Date(s.time).getTime() + (opts.durationMinutes ?? 30) * 60 * 1000).toISOString(),
      })
    }
  }
  return out
}

/** Build a public booking URL the AI can drop into a reply. */
export function bookingUrl(eventSlug: string, prefill?: Record<string, string>): string {
  const params = new URLSearchParams(prefill ?? {})
  const qs = params.toString()
  return `https://cal.com/${eventSlug}${qs ? '?' + qs : ''}`
}
