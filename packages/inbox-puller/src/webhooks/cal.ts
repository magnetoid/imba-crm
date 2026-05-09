// Cal.com webhook receiver. Configure on the Cal.com side to POST
// every BOOKING_CREATED / BOOKING_RESCHEDULED / BOOKING_CANCELLED event
// to https://crm.imbaproduction.com/api/webhooks/cal — this handler
// inserts a crm_activities row of type='meeting' on the matching lead
// and ticks the responded_at on any pending outreach.
//
// Authentication: Cal.com signs each payload with HMAC-SHA256 of the
// raw body using the secret you set when creating the webhook. Set
// CAL_WEBHOOK_SECRET in Coolify env (or store under
// crm_provider_credentials.extra.webhook_secret) and we'll verify.

import type { Hono } from 'hono'
import crypto from 'node:crypto'
import { supabase, loadProviderCredential } from '../supabase.js'

interface CalPayload {
  triggerEvent?: string
  payload?: {
    uid?: string
    title?: string
    startTime?: string
    endTime?: string
    eventType?: { id?: number; slug?: string }
    organizer?: { name?: string; email?: string; timeZone?: string }
    attendees?: Array<{ name?: string; email?: string; timeZone?: string }>
    additionalNotes?: string
  }
}

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'webhook-cal', ...extra, time: new Date().toISOString() }))
}

async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader) return false
  const cred = await loadProviderCredential('cal')
  const secret = (cred?.extra?.webhook_secret as string | undefined) || process.env.CAL_WEBHOOK_SECRET || ''
  if (!secret) {
    // No shared secret configured — accept (dev mode), but flag it.
    log('warn', 'no webhook secret configured; accepting unsigned')
    return true
  }
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  // Cal.com sometimes sends 'sha256=…' or just the hex.
  const provided = signatureHeader.replace(/^sha256=/, '')
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(provided, 'hex'))
  } catch {
    return false
  }
}

export function mountCalWebhook(app: Hono) {
  app.post('/api/webhooks/cal', async c => {
    const raw = await c.req.text()
    const sig = c.req.header('x-cal-signature-256') || c.req.header('x-cal-signature')
    const ok = await verifySignature(raw, sig ?? null)
    if (!ok) return c.json({ error: 'invalid signature' }, 401)

    let body: CalPayload
    try { body = JSON.parse(raw) as CalPayload } catch { return c.json({ error: 'bad json' }, 400) }
    const event = body.triggerEvent ?? 'unknown'
    const p = body.payload ?? {}
    const attendeeEmail = p.attendees?.[0]?.email?.toLowerCase()

    log('info', 'cal webhook received', { event, uid: p.uid, attendee: attendeeEmail })

    // Match by attendee email → lead.
    let leadId: string | null = null
    if (attendeeEmail) {
      const { data: lead } = await supabase
        .from('crm_leads')
        .select('id')
        .eq('email', attendeeEmail)
        .maybeSingle()
      leadId = (lead as { id: string } | null)?.id ?? null
    }

    // Insert an activity row regardless (lead_id may be null — operator
    // can attach later via the lead's activity timeline).
    if (leadId) {
      await supabase.from('crm_activities').insert({
        lead_id: leadId,
        type: 'meeting',
        subject: p.title || 'Booked via Cal.com',
        body: JSON.stringify({
          event,
          uid: p.uid,
          startTime: p.startTime,
          endTime: p.endTime,
          attendee: attendeeEmail,
          additional_notes: p.additionalNotes,
        }, null, 2),
        created_by: 'cal-webhook',
      })

      // Mark any pending meeting_request outreach for this lead as responded.
      await supabase.from('crm_outreach_attempts')
        .update({ responded_at: new Date().toISOString() })
        .eq('lead_id', leadId)
        .is('responded_at', null)
        .order('created_at', { ascending: false })
        .limit(5)
    }

    return c.json({ ok: true, event, attendee: attendeeEmail, lead_id: leadId })
  })
}
