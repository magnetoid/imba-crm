// HTTP server inside the worker container. Exposed at port 3030 (internal
// docker network only — the SPA's nginx proxies /track/ and /api/worker/
// to it). Two surfaces:
//
//   /track/*   public, used inside outbound emails for opens/clicks
//   /api/worker/test/*  authenticated, called from the Settings UI to
//                        validate IMAP/POP3/SMTP creds before saving
//
// For test endpoints we accept the user's Supabase JWT in the
// `Authorization: Bearer …` header and verify it with the same JWT_SECRET
// the gotrue auth service uses. Only callers whose JWT carries
// app_metadata.role='admin' (or user_metadata.role='admin') may run the
// connection tests.

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import Pop3Command from 'node-pop3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { supabase } from './supabase.js'
import { mountWidgetApi } from './widget-api.js'
import { mountCalWebhook } from './webhooks/cal.js'

const PORT = parseInt(process.env.WORKER_HTTP_PORT || '3030', 10)
const JWT_SECRET = process.env.JWT_SECRET || ''

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'server', ...extra, time: new Date().toISOString() }))
}

// ── 1×1 transparent gif used as the open-pixel response ─────────────────
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
)

function b64urlDecode(s: string) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

/** Verify HS256 JWT with our shared secret; return claims or null. */
function verifyJwt(token: string): Record<string, unknown> | null {
  if (!JWT_SECRET) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, sig] = parts
  const expected = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${h}.${p}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (expected !== sig) return null
  try {
    const claims = JSON.parse(b64urlDecode(p)) as Record<string, unknown>
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null
    return claims
  } catch { return null }
}

function isAdmin(claims: Record<string, unknown> | null): boolean {
  if (!claims) return false
  const app = claims.app_metadata as Record<string, unknown> | undefined
  const usr = claims.user_metadata as Record<string, unknown> | undefined
  return (app?.role === 'admin') || (usr?.role === 'admin') || claims.role === 'service_role'
}

export function startHttpServer() {
  const app = new Hono()

  app.get('/healthz', c => c.text('ok'))

  // ── Embeddable chat widget bootstrap ──────────────────────────────
  // Serve /widget.js from disk. Built by `pnpm --filter @imba/widget build`
  // and copied into the runner image at /app/widget/widget.js.
  app.get('/widget.js', c => {
    try {
      const candidates = [
        '/app/widget/widget.js',
        path.resolve(process.cwd(), 'widget/widget.js'),
      ]
      let body: Buffer | null = null
      for (const p of candidates) {
        try { body = fs.readFileSync(p); break } catch { /* next */ }
      }
      if (!body) return c.text('// widget.js not built\n', 404)
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'public, max-age=300',
          'access-control-allow-origin': '*',
        },
      })
    } catch {
      return c.text('// widget.js read error\n', 500)
    }
  })

  // Mount the widget HTTP API (POST/GET /api/widget/*).
  mountWidgetApi(app)

  // Third-party webhook receivers (Cal.com bookings → CRM activity log).
  mountCalWebhook(app)

  // ── Open-pixel ────────────────────────────────────────────────────────
  app.get('/track/pixel/:idgif', async c => {
    const idgif = c.req.param('idgif')
    const tracking = idgif.replace(/\.gif$/i, '')
    void recordPixelOpen(tracking, c.req.header('user-agent') || '', c.req.header('x-forwarded-for') || '')
    return new Response(PIXEL, {
      status: 200,
      headers: {
        'content-type': 'image/gif',
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        'pragma': 'no-cache',
      },
    })
  })

  // ── Visit ping (first-party intent stream) ───────────────────────────
  // Called from the widget on every page view of the host site. CORS is
  // open because the widget runs on third-party origins.
  app.options('/track/visit', c => {
    c.header('Access-Control-Allow-Origin', '*')
    c.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'content-type')
    return c.body(null, 204)
  })
  app.post('/track/visit', async c => {
    c.header('Access-Control-Allow-Origin', '*')
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const token = typeof body.token === 'string' ? body.token : null
    if (!token || !/^wid_[a-z0-9_]{4,80}$/i.test(token)) {
      return c.json({ error: 'bad token' }, 400)
    }
    void recordVisit({
      token,
      url: typeof body.url === 'string' ? body.url.slice(0, 1000) : null,
      referrer: typeof body.referrer === 'string' ? body.referrer.slice(0, 1000) : null,
      utm: (body.utm && typeof body.utm === 'object') ? body.utm as Record<string, unknown> : {},
      ua: c.req.header('user-agent') || '',
      ip: c.req.header('x-forwarded-for') || '',
    })
    return c.json({ ok: true })
  })

  // ── Click redirect ────────────────────────────────────────────────────
  app.get('/track/click/:tracking', async c => {
    const tracking = c.req.param('tracking')
    const target = c.req.query('u')
    if (!target) return c.text('missing target', 400)
    let url: URL
    try { url = new URL(target) } catch { return c.text('invalid target', 400) }
    if (!['http:', 'https:'].includes(url.protocol)) return c.text('blocked scheme', 400)
    void recordClick(tracking, url.toString(), c.req.header('user-agent') || '', c.req.header('x-forwarded-for') || '')
    return c.redirect(url.toString(), 302)
  })

  // ── Auth gate for /api/worker ─────────────────────────────────────────
  app.use('/api/worker/*', async (c, next) => {
    const auth = c.req.header('authorization') || ''
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (!m) return c.json({ error: 'missing bearer token' }, 401)
    const claims = verifyJwt(m[1])
    if (!claims) return c.json({ error: 'invalid token' }, 401)
    if (!isAdmin(claims)) return c.json({ error: 'admin only' }, 403)
    await next()
  })

  // ── Test SMTP ────────────────────────────────────────────────────────
  app.post('/api/worker/test/smtp', async c => {
    const body = await c.req.json().catch(() => ({})) as Partial<{ password: string }>
    const password = body.password ?? await getStoredSecret('smtp')
    if (!password) return c.json({ ok: false, message: 'No SMTP password stored. Enter one and click "Save settings" first.' }, 200)

    const settings = await loadSettings('smtp')
    if (!settings) return c.json({ ok: false, message: 'No runtime_settings row.' }, 200)
    try {
      const t = nodemailer.createTransport({
        host: settings.smtp_host,
        port: parseInt(settings.smtp_port || '587', 10),
        secure: !!settings.smtp_secure,
        auth: { user: settings.smtp_username, pass: password },
        connectionTimeout: 10000,
      })
      await t.verify()
      return c.json({ ok: true, message: 'SMTP login + STARTTLS OK.' })
    } catch (err) {
      return c.json({ ok: false, message: (err as Error).message })
    }
  })

  // ── Test IMAP ────────────────────────────────────────────────────────
  app.post('/api/worker/test/imap', async c => {
    const body = await c.req.json().catch(() => ({})) as Partial<{ password: string }>
    const password = body.password ?? await getStoredSecret('imap')
    if (!password) return c.json({ ok: false, message: 'No IMAP password stored. Enter one and click "Save settings" first.' }, 200)

    const settings = await loadSettings('imap')
    if (!settings) return c.json({ ok: false, message: 'No runtime_settings row.' }, 200)
    const client = new ImapFlow({
      host: settings.imap_host,
      port: parseInt(settings.imap_port || '993', 10),
      secure: !!settings.imap_secure,
      auth: { user: settings.imap_username, pass: password },
      logger: false,
    })
    try {
      await client.connect()
      const list = (await client.list()).map(b => b.path).slice(0, 10)
      await client.logout()
      return c.json({ ok: true, message: `IMAP login OK. Folders: ${list.join(', ') || '(none visible)'}` })
    } catch (err) {
      try { await client.logout() } catch { /* ignore */ }
      return c.json({ ok: false, message: (err as Error).message })
    }
  })

  // ── Test POP3 ────────────────────────────────────────────────────────
  app.post('/api/worker/test/pop3', async c => {
    const body = await c.req.json().catch(() => ({})) as Partial<{ password: string }>
    const password = body.password ?? await getStoredSecret('pop3')
    if (!password) return c.json({ ok: false, message: 'No POP3 password stored. Enter one and click "Save settings" first.' }, 200)

    const settings = await loadSettings('pop3')
    if (!settings) return c.json({ ok: false, message: 'No runtime_settings row.' }, 200)
    const client = new Pop3Command({
      host: settings.pop3_host,
      port: parseInt(settings.pop3_port || '995', 10),
      user: settings.pop3_username,
      password,
      tls: !!settings.pop3_secure,
      timeout: 10000,
    })
    try {
      await client.connect()
      const stat = await client.STAT()
      try { await client.QUIT() } catch { /* ignore */ }
      return c.json({ ok: true, message: `POP3 login OK. ${stat[0]} messages, ${stat[1]} bytes.` })
    } catch (err) {
      try { await client.QUIT() } catch { /* ignore */ }
      return c.json({ ok: false, message: (err as Error).message })
    }
  })

  serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' })
  log('info', 'http server listening', { port: PORT, has_jwt_secret: !!JWT_SECRET, track_base: process.env.TRACK_BASE_URL })
}

// ── Helpers ────────────────────────────────────────────────────────────
async function recordPixelOpen(trackingId: string, ua: string, ip: string) {
  const { data } = await supabase
    .from('crm_outreach_emails')
    .select('id, opened_at')
    .eq('tracking_id', trackingId)
    .maybeSingle()
  const row = data as { id: string; opened_at: string | null } | null
  if (!row) return
  if (!row.opened_at) {
    await supabase.from('crm_outreach_emails').update({ opened_at: new Date().toISOString() }).eq('id', row.id)
  }
  await supabase.from('crm_email_events').insert({
    email_id: row.id, event_type: 'open',
    metadata: { user_agent: ua.slice(0, 200), ip: ip.slice(0, 100) },
  })
}

async function recordClick(trackingId: string, target: string, ua: string, ip: string) {
  const { data } = await supabase
    .from('crm_outreach_emails')
    .select('id, opened_at')
    .eq('tracking_id', trackingId)
    .maybeSingle()
  const row = data as { id: string; opened_at: string | null } | null
  if (!row) return
  // A click implies an open even if the pixel was blocked.
  if (!row.opened_at) {
    await supabase.from('crm_outreach_emails').update({ opened_at: new Date().toISOString() }).eq('id', row.id)
  }
  await supabase.from('crm_email_events').insert({
    email_id: row.id, event_type: 'click',
    metadata: { url: target, user_agent: ua.slice(0, 200), ip: ip.slice(0, 100) },
  })
}

interface AnySettings {
  imap_host: string; imap_port: string; imap_secure: boolean; imap_username: string
  pop3_host: string; pop3_port: string; pop3_secure: boolean; pop3_username: string
  smtp_host: string; smtp_port: string; smtp_secure: boolean; smtp_username: string
}
async function loadSettings(_kind: 'smtp' | 'imap' | 'pop3'): Promise<AnySettings | null> {
  const { data } = await supabase
    .from('crm_runtime_settings')
    .select('imap_host, imap_port, imap_secure, imap_username, pop3_host, pop3_port, pop3_secure, pop3_username, smtp_host, smtp_port, smtp_secure, smtp_username')
    .eq('id', 1)
    .maybeSingle()
  return (data as AnySettings | null) ?? null
}

async function recordVisit(args: {
  token: string
  url: string | null
  referrer: string | null
  utm: Record<string, unknown>
  ua: string
  ip: string
}) {
  // If this token already maps to a known lead via a widget conversation,
  // attribute the event immediately (so intent_score stays current). The
  // backfill RPC handles future-known leads.
  const { data: conv } = await supabase
    .from('crm_widget_conversations')
    .select('lead_id')
    .eq('visitor_token', args.token)
    .maybeSingle()
  const leadId = (conv as { lead_id: string | null } | null)?.lead_id ?? null

  await supabase.from('crm_visitor_events').insert({
    visitor_token: args.token,
    lead_id: leadId,
    event_type: 'page_view',
    url: args.url,
    referrer: args.referrer,
    utm: args.utm,
    user_agent: args.ua.slice(0, 200),
    ip: args.ip.slice(0, 100),
  })
}

async function getStoredSecret(provider: 'smtp' | 'imap' | 'pop3'): Promise<string | null> {
  const { data } = await supabase
    .from('crm_provider_credentials')
    .select('api_key')
    .eq('provider', provider)
    .maybeSingle()
  return (data as { api_key: string | null } | null)?.api_key ?? null
}
