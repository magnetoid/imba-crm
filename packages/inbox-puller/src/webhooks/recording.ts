// Recording webhook receiver. Accepts post-call events from Daily.co,
// Whereby, Cal.com (when self-hosted with recording enabled), or any
// generic provider that POSTs JSON like:
//
//   { meeting_uid, recording_url, attendee_email, started_at, duration_s,
//     transcript_url?, transcript_text? }
//
// Auth: HMAC-SHA256 over the raw body using a shared secret stored at
//       crm_provider_credentials.extra.recording_webhook_secret OR the
//       env var RECORDING_WEBHOOK_SECRET. If no secret is configured we
//       accept the call (dev mode) but log a warning.
//
// Behaviour:
//   - Match attendee_email → crm_leads
//   - Insert (or update by metadata.meeting_uid) a crm_activities row of
//     type='meeting' with recording_url + transcript_text/url.
//   - The crm_activities trigger (20260522) auto-enqueues the
//     `call-analyzer` agent which transcribes (if needed) + extracts
//     coach notes.

import type { Hono } from 'hono'
import crypto from 'node:crypto'
import { supabase, loadProviderCredential } from '../supabase.js'

interface RecordingPayload {
  meeting_uid?:    string
  recording_url?:  string
  transcript_url?: string
  transcript_text?: string
  attendee_email?: string
  started_at?:     string
  duration_s?:     number
  title?:          string
  source?:         string    // 'daily' | 'whereby' | 'cal' | …
}

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'webhook-recording', ...extra, time: new Date().toISOString() }))
}

async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const cred = await loadProviderCredential('recording')
  const secret =
    (cred?.extra?.recording_webhook_secret as string | undefined) ||
    process.env.RECORDING_WEBHOOK_SECRET ||
    ''
  if (!secret) {
    log('warn', 'no recording-webhook secret configured; accepting unsigned')
    return true
  }
  if (!signatureHeader) return false
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const provided = signatureHeader.replace(/^sha256=/, '')
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(provided, 'hex'))
  } catch { return false }
}

export function mountRecordingWebhook(app: Hono) {
  app.post('/api/webhooks/recording', async c => {
    const raw = await c.req.text()
    const sig = c.req.header('x-recording-signature-256') || c.req.header('x-signature')
    const ok = await verifySignature(raw, sig ?? null)
    if (!ok) return c.json({ error: 'invalid signature' }, 401)

    let body: RecordingPayload
    try { body = JSON.parse(raw) as RecordingPayload } catch { return c.json({ error: 'bad json' }, 400) }
    const email = body.attendee_email?.toLowerCase()

    log('info', 'recording received', {
      uid: body.meeting_uid, source: body.source, attendee: email,
      has_url: !!body.recording_url, has_transcript: !!body.transcript_text,
    })

    // Resolve lead by attendee email.
    let leadId: string | null = null
    if (email) {
      const { data: lead } = await supabase
        .from('crm_leads')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      leadId = (lead as { id: string } | null)?.id ?? null
    }

    // Upsert by meeting_uid stored in metadata.meeting_uid.
    let existingId: string | null = null
    if (body.meeting_uid) {
      const { data: existing } = await supabase
        .from('crm_activities')
        .select('id')
        .eq('type', 'meeting')
        .eq('metadata->>meeting_uid', body.meeting_uid)
        .maybeSingle()
      existingId = (existing as { id: string } | null)?.id ?? null
    }

    const payload = {
      lead_id: leadId,
      type: 'meeting',
      subject: body.title || 'Recorded call',
      body: body.transcript_text
        ? body.transcript_text.slice(0, 2000)
        : `Recording received from ${body.source ?? 'unknown'} at ${body.started_at ?? new Date().toISOString()}`,
      created_by: 'recording-webhook',
      recording_url:   body.recording_url   ?? null,
      transcript_url:  body.transcript_url  ?? null,
      transcript_text: body.transcript_text ?? null,
      metadata: {
        meeting_uid: body.meeting_uid,
        source:      body.source,
        attendee:    email,
        started_at:  body.started_at,
        duration_s:  body.duration_s,
      },
    }

    if (existingId) {
      const { error } = await supabase.from('crm_activities').update(payload).eq('id', existingId)
      if (error) return c.json({ error: error.message }, 500)
      // Trigger fires on update too — coach_notes will land within a few
      // ticks of the agent loop.
      return c.json({ ok: true, mode: 'update', activity_id: existingId, lead_id: leadId })
    } else {
      const { data, error } = await supabase
        .from('crm_activities')
        .insert(payload)
        .select('id')
        .maybeSingle()
      if (error) return c.json({ error: error.message }, 500)
      return c.json({ ok: true, mode: 'insert', activity_id: (data as { id: string } | null)?.id, lead_id: leadId })
    }
  })
}
