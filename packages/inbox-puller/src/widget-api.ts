// HTTP endpoints that back the embeddable chat widget.
//
// All endpoints are public (the widget is unauthenticated). Visitor
// identity is carried by a `token` they generate client-side and store
// in localStorage. We rate-limit + sanity-check on the server but don't
// trust anything the widget sends.
//
// Routes mounted by ./server.ts under /api/widget/*:
//
//   POST /api/widget/conversations          create/identify
//   GET  /api/widget/conversations?token=…  resume an existing one
//   POST /api/widget/messages               visitor posts a message
//   GET  /api/widget/messages?token=…&conversation_id=…[&since=…]
//                                           fetch history / poll for staff replies

import type { Hono } from 'hono'
import { supabase } from './supabase.js'
import { categorizeInboundMessage, getAISettings } from './ai.js'

interface WidgetMessage {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  received_at: string
}

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'widget-api', ...extra, time: new Date().toISOString() }))
}

const TOKEN_RX = /^wid_[a-z0-9]{4,40}_[a-z0-9]{4,40}$/i
function isValidToken(t: unknown): t is string {
  return typeof t === 'string' && TOKEN_RX.test(t)
}

const MAX_BODY = 4000

export function mountWidgetApi(app: Hono) {
  // ── Allow the widget to be served from any origin ─────────────────
  // The widget itself is loaded as <script src="https://crm…/widget.js">,
  // so its fetch() calls are cross-origin from the host site's perspective.
  app.use('/api/widget/*', async (c, next) => {
    c.header('Access-Control-Allow-Origin',  '*')
    c.header('Access-Control-Allow-Headers', 'content-type')
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204)
    }
    await next()
  })

  // ── POST /api/widget/conversations ────────────────────────────────
  // Creates a conversation row + a corresponding crm_leads row keyed by
  // the visitor email. Idempotent: if the same token is sent again it
  // returns the existing conversation.
  app.post('/api/widget/conversations', async c => {
    const settings = await loadWidgetSettings()
    if (!settings.enabled) return c.json({ error: 'widget disabled' }, 403)
    const ip = c.req.header('x-forwarded-for') || ''
    const ua = c.req.header('user-agent') || ''
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const { token, name, email, company, origin } = body
    if (!isValidToken(token)) return c.json({ error: 'bad token' }, 400)
    if (typeof email !== 'string' || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      return c.json({ error: 'invalid email' }, 400)
    }
    if (!isAllowedOrigin(origin as string | undefined, settings.origins)) {
      return c.json({ error: 'origin not allowed' }, 403)
    }

    // Upsert the lead by email (don't overwrite an existing lead's stage).
    let leadId: string | null = null
    {
      const { data: existing } = await supabase
        .from('crm_leads')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle()
      if (existing) {
        leadId = (existing as { id: string }).id
      } else {
        const { data: created } = await supabase
          .from('crm_leads')
          .insert({
            name:    typeof name === 'string'    ? name.slice(0, 200) : null,
            email:   email.toLowerCase(),
            company: typeof company === 'string' ? company.slice(0, 200) : null,
            stage:   'new',
            source:  'widget',
          })
          .select('id')
          .maybeSingle()
        leadId = (created as { id: string } | null)?.id ?? null
      }
    }

    // Upsert the conversation by visitor_token.
    const { data: existingConv } = await supabase
      .from('crm_widget_conversations')
      .select('id')
      .eq('visitor_token', token)
      .maybeSingle()

    let convId: string
    if (existingConv) {
      convId = (existingConv as { id: string }).id
      await supabase.from('crm_widget_conversations').update({
        lead_id: leadId,
        visitor_name:    typeof name    === 'string' ? name.slice(0, 200) : null,
        visitor_email:   email.toLowerCase(),
        visitor_company: typeof company === 'string' ? company.slice(0, 200) : null,
        last_message_at: new Date().toISOString(),
      }).eq('id', convId)
    } else {
      const { data: created } = await supabase
        .from('crm_widget_conversations')
        .insert({
          lead_id: leadId,
          visitor_token: token,
          visitor_name:    typeof name    === 'string' ? name.slice(0, 200) : null,
          visitor_email:   email.toLowerCase(),
          visitor_company: typeof company === 'string' ? company.slice(0, 200) : null,
          origin: typeof origin === 'string' ? origin.slice(0, 500) : null,
          user_agent: ua.slice(0, 200),
          ip: ip.slice(0, 100),
        })
        .select('id')
        .maybeSingle()
      if (!created) return c.json({ error: 'failed to create conversation' }, 500)
      convId = (created as { id: string }).id
    }

    return c.json({ conversation_id: convId, identified: true })
  })

  // ── GET /api/widget/conversations?token=… ────────────────────────
  // Resume an existing conversation if one exists for this token.
  app.get('/api/widget/conversations', async c => {
    const token = c.req.query('token')
    if (!isValidToken(token)) return c.json({ error: 'bad token' }, 400)
    const { data } = await supabase
      .from('crm_widget_conversations')
      .select('id, visitor_email')
      .eq('visitor_token', token)
      .maybeSingle()
    const row = data as { id: string; visitor_email: string | null } | null
    if (!row) return c.json({ conversation_id: null, identified: false })
    return c.json({
      conversation_id: row.id,
      identified: !!row.visitor_email,
    })
  })

  // ── POST /api/widget/messages ─────────────────────────────────────
  // Visitor sends a message. Insert as crm_inbox_messages (inbound),
  // attach to the lead, fire AI auto-categorize in the background.
  app.post('/api/widget/messages', async c => {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const { token, conversation_id, body: text } = body
    if (!isValidToken(token)) return c.json({ error: 'bad token' }, 400)
    if (typeof conversation_id !== 'string') return c.json({ error: 'missing conversation_id' }, 400)
    if (typeof text !== 'string' || !text.trim()) return c.json({ error: 'empty body' }, 400)
    const trimmed = text.slice(0, MAX_BODY)

    // Verify the token matches the conversation (so an attacker who guesses
    // a conversation_id can't post on someone else's behalf).
    const { data: conv } = await supabase
      .from('crm_widget_conversations')
      .select('id, lead_id, visitor_email, visitor_name, status')
      .eq('id', conversation_id)
      .eq('visitor_token', token)
      .maybeSingle()
    const row = conv as {
      id: string; lead_id: string | null; visitor_email: string | null;
      visitor_name: string | null; status: string;
    } | null
    if (!row) return c.json({ error: 'conversation not found' }, 404)
    if (row.status !== 'open') return c.json({ error: 'conversation closed' }, 410)

    const { data: inserted } = await supabase
      .from('crm_inbox_messages')
      .insert({
        lead_id: row.lead_id,
        direction: 'inbound',
        subject: null,
        body: trimmed,
        from_email: row.visitor_email,
        to_email: null,
        status: 'unread',
        received_at: new Date().toISOString(),
        type: 'general',
        priority: 'normal',
        metadata: {
          source: 'widget',
          conversation_id: row.id,
          visitor_name: row.visitor_name,
        },
      })
      .select('id')
      .maybeSingle()

    await supabase.from('crm_widget_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', row.id)

    // Best-effort AI categorize (same shape as the IMAP loop uses).
    const insertedId = (inserted as { id: string } | null)?.id
    if (insertedId) {
      const ai = await getAISettings()
      if (ai?.ai_inbox_auto_categorize) {
        void categorizeInboundMessage({
          from_email: row.visitor_email,
          subject: null,
          body: trimmed,
        }).then(out => {
          if (!out) return
          void supabase.from('crm_inbox_messages').update({
            ai_category: out.category,
            ai_sentiment: out.sentiment,
            ai_suggested_reply: out.suggested_reply,
          }).eq('id', insertedId)
        }).catch(() => { /* ignore */ })
      }
    }

    return c.json({ ok: true })
  })

  // ── GET /api/widget/messages?token=…&conversation_id=…[&since=…] ──
  // Returns history + new staff replies. Used by the widget's poll loop.
  // Visitors only see their own conversation; the token has to match.
  app.get('/api/widget/messages', async c => {
    const token = c.req.query('token')
    const convId = c.req.query('conversation_id')
    const since  = c.req.query('since') || null
    if (!isValidToken(token)) return c.json({ error: 'bad token' }, 400)
    if (!convId)              return c.json({ error: 'missing conversation_id' }, 400)

    const { data: conv } = await supabase
      .from('crm_widget_conversations')
      .select('id')
      .eq('id', convId)
      .eq('visitor_token', token)
      .maybeSingle()
    if (!conv) return c.json({ error: 'conversation not found' }, 404)

    let q = supabase
      .from('crm_inbox_messages')
      .select('id, direction, body, received_at, metadata')
      .eq('metadata->>conversation_id', convId)
      .order('received_at', { ascending: true })
      .limit(200)
    if (since) q = q.gt('received_at', since)
    const { data, error } = await q
    if (error) {
      log('error', 'widget messages query failed', { error: error.message })
      return c.json({ messages: [] })
    }
    const rows = (data as Array<{
      id: string; direction: string; body: string; received_at: string;
      metadata: Record<string, unknown>;
    }> | null) ?? []

    const messages: WidgetMessage[] = rows.map(r => ({
      id: r.id,
      direction: r.direction === 'outbound' ? 'outbound' : 'inbound',
      body: r.body,
      received_at: r.received_at,
    }))
    const cursor = messages.length > 0 ? messages[messages.length - 1].received_at : since

    return c.json({ messages, cursor })
  })
}

interface WidgetSettings {
  enabled: boolean
  origins: string[]
}

async function loadWidgetSettings(): Promise<WidgetSettings> {
  const { data } = await supabase
    .from('crm_runtime_settings')
    .select('widget_enabled, widget_origins')
    .eq('id', 1)
    .maybeSingle()
  const row = data as { widget_enabled: boolean; widget_origins: unknown } | null
  if (!row) return { enabled: false, origins: [] }
  let origins: string[] = []
  if (Array.isArray(row.widget_origins)) {
    origins = (row.widget_origins as unknown[]).filter((s): s is string => typeof s === 'string')
  }
  return { enabled: !!row.widget_enabled, origins }
}

function isAllowedOrigin(origin: string | undefined, allowed: string[]): boolean {
  // Empty allowlist → allow any origin (single-tenant install).
  if (!allowed || allowed.length === 0) return true
  if (!origin) return false
  try {
    const u = new URL(origin)
    const host = u.host
    return allowed.some(a => host === a || host.endsWith('.' + a))
  } catch {
    return false
  }
}
