// Inbox AI endpoints (Phase 12.3).
//
//   POST /api/inbox/suggest    — body { thread_id, message_id? }
//                                 Returns 3 short reply suggestions (each
//                                 80–140 chars). Like Superhuman "Instant
//                                 Reply".
//   POST /api/inbox/compose    — body { thread_id?, message_id?, prompt }
//                                 Returns a full draft reply for the
//                                 given prompt ("draft something thanking
//                                 them and proposing Wednesday").
//   POST /api/inbox/rewrite    — body { text, tone }
//                                 Rewrites operator-typed text in the
//                                 requested tone. tones:
//                                   shorter | friendlier | more-direct
//                                   | more-formal | fix-grammar | translate-en
//
// Auth: same JWT pattern as /api/nomo/* and /api/worker/*.

import type { Hono } from 'hono'
import { supabase } from './supabase.js'
import { callAIJSON, getAISettings } from './ai.js'

const JWT_SECRET = process.env.JWT_SECRET || ''

function b64urlDecode(s: string) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

async function verifyAuth(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m || !JWT_SECRET) return null
  const parts = m[1].split('.')
  if (parts.length !== 3) return null
  const crypto = await import('node:crypto')
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (expected !== parts[2]) return null
  try {
    const c = JSON.parse(b64urlDecode(parts[1])) as { sub?: string; exp?: number }
    if (typeof c.exp === 'number' && c.exp * 1000 < Date.now()) return null
    return c.sub ?? null
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'invalid jwt — payload decode failed', source: 'inbox-ai', error: (e as Error).message, time: new Date().toISOString() }))
    return null
  }
}

interface MessageRow {
  id: string
  thread_key: string | null
  lead_id: string | null
  direction: 'inbound' | 'outbound'
  subject: string | null
  body: string | null
  from_email: string | null
  received_at: string
  ai_category?: string | null
  ai_sentiment?: string | null
}

interface LeadRow {
  id: string
  name: string
  email: string | null
  company: string | null
  service_interest: string | null
  stage: string
  fit_score: number | null
  intent_score: number | null
  objections: Array<{ slug: string; label: string; evidence: string }> | null
}

async function loadThread(threadKey: string, focusMessageId?: string): Promise<{ messages: MessageRow[]; lead: LeadRow | null }> {
  const { data: msgs } = await supabase
    .from('crm_inbox_messages')
    .select('id, thread_key, lead_id, direction, subject, body, from_email, received_at, ai_category, ai_sentiment')
    .eq('thread_key', threadKey)
    .order('received_at', { ascending: true })
    .limit(50)
  const messages = (msgs as MessageRow[] | null) ?? []
  let lead: LeadRow | null = null
  const leadId = messages.find(m => m.lead_id)?.lead_id
  if (leadId) {
    const { data: l } = await supabase
      .from('crm_leads')
      .select('id, name, email, company, service_interest, stage, fit_score, intent_score, objections')
      .eq('id', leadId).maybeSingle()
    lead = l as LeadRow | null
  }
  void focusMessageId
  return { messages, lead }
}

function buildContext(messages: MessageRow[], lead: LeadRow | null, settings: { company_name?: string; ai_outreach_tone?: string } | null): string {
  const transcript = messages.slice(-10).map(m => {
    const who = m.direction === 'inbound' ? (m.from_email ?? 'them') : 'us'
    return `[${who} · ${m.received_at}] ${m.subject ? `Subject: ${m.subject}\n` : ''}${(m.body ?? '').slice(0, 1500)}`
  }).join('\n\n---\n\n')

  const leadCtx = lead ? `Lead: ${lead.name} @ ${lead.company ?? '?'} · stage ${lead.stage} · fit ${lead.fit_score ?? '–'} · intent ${lead.intent_score ?? '–'} · service interest: ${lead.service_interest ?? '?'}`
    : 'No lead match — this is an unattributed inbound conversation.'
  const objections = (lead?.objections ?? []).map(o => `${o.label}: "${o.evidence}"`).join('; ')
  return `Company: ${settings?.company_name ?? 'our team'}. Default tone: ${settings?.ai_outreach_tone ?? 'professional'}.
${leadCtx}${objections ? '\nKnown objections: ' + objections : ''}

Conversation (oldest first, last 10):
${transcript}`
}

export function mountInboxAi(app: Hono) {
  app.use('/api/inbox/*', async (c, next) => {
    const uid = await verifyAuth(c.req.header('authorization'))
    if (!uid) return c.json({ error: 'unauthorized' }, 401)
    await next()
  })

  // ── /suggest ─────────────────────────────────────────────────────
  app.post('/api/inbox/suggest', async c => {
    const body = await c.req.json().catch(() => ({})) as { thread_id?: string; message_id?: string }
    const threadKey = body.thread_id
    if (!threadKey) return c.json({ error: 'thread_id required' }, 400)
    const settings = await getAISettings()
    const { messages, lead } = await loadThread(threadKey, body.message_id)
    if (messages.length === 0) return c.json({ error: 'no messages in thread' }, 404)
    const ctx = buildContext(messages, lead, settings)
    const prompt = `${ctx}

The operator wants to reply to the most recent inbound message. Generate exactly 3 reply options:
- option 1: a short positive/accepting reply (≤80 words)
- option 2: a question or pushback that buys time
- option 3: a "warm decline" that keeps the door open

Each option should sound human, match the default tone, and reference a specific thing the prospect said. No greetings ("Hi …") or sign-offs ("Best, …") — those are added by the operator.

Return ONLY JSON: {"suggestions":[{"label":"positive","text":"..."},{"label":"clarify","text":"..."},{"label":"polite-no","text":"..."}]}`
    const out = await callAIJSON<{ suggestions: Array<{ label: string; text: string }> }>({ userPrompt: prompt, maxTokens: 700 })
    if (!out) return c.json({ error: 'AI returned no result' }, 502)
    return c.json(out)
  })

  // ── /compose ─────────────────────────────────────────────────────
  app.post('/api/inbox/compose', async c => {
    const body = await c.req.json().catch(() => ({})) as { thread_id?: string; prompt?: string }
    if (!body.thread_id || !body.prompt) return c.json({ error: 'thread_id + prompt required' }, 400)
    const settings = await getAISettings()
    const { messages, lead } = await loadThread(body.thread_id)
    const ctx = buildContext(messages, lead, settings)
    const userPrompt = `${ctx}

Operator wants you to draft a reply. Operator's intent:
"""
${body.prompt}
"""

Draft a complete reply email body (no subject; the SPA prefixes "Re: ").
- ≤180 words.
- Match the default tone.
- Reference at least one specific phrase the prospect used (if any).
- End with ONE clear next-step ask.
- Do NOT include a "Best, <name>" sign-off — the operator's SMTP signature handles that.

Return ONLY JSON: {"body":"plain text or simple HTML"}`
    const out = await callAIJSON<{ body: string }>({ userPrompt, maxTokens: 700 })
    if (!out?.body) return c.json({ error: 'AI returned no body' }, 502)
    return c.json(out)
  })

  // ── /rewrite ─────────────────────────────────────────────────────
  app.post('/api/inbox/rewrite', async c => {
    const body = await c.req.json().catch(() => ({})) as { text?: string; tone?: string; thread_id?: string }
    if (!body.text || !body.text.trim()) return c.json({ error: 'text required' }, 400)
    const tone = (body.tone ?? 'friendlier').toLowerCase()
    const settings = await getAISettings()
    let extraCtx = ''
    if (body.thread_id) {
      const { messages, lead } = await loadThread(body.thread_id)
      extraCtx = '\nContext for reference:\n' + buildContext(messages, lead, settings)
    }
    const toneHint = ({
      shorter:        'Cut at least 30% of the words while keeping every concrete fact and the CTA.',
      friendlier:     'Add warmth — first-name address, one personal acknowledgement — without losing the point.',
      'more-direct':  'Strip filler and softeners. Lead with the ask. No "I hope you\'re well".',
      'more-formal':  'Tighten to business-formal English. No contractions. Keep the meaning intact.',
      'fix-grammar':  'Fix grammar, spelling, and punctuation. Keep wording as close to the original as possible.',
      'translate-en': 'Translate the entire text into clear, professional English. Preserve names and links.',
    } as Record<string, string>)[tone] ?? 'Make it sound more natural and on-tone.'

    const prompt = `Rewrite the operator's draft below. Goal: ${toneHint}
Keep the same intent, just change the phrasing. Do NOT add new facts or invented details.${extraCtx}

Original draft:
"""
${body.text}
"""

Return ONLY the rewritten body as plain text. No commentary, no quotes around the output.`
    const out = await callAIJSON<{ body: string }>({
      systemPrompt: 'You return strictly valid minified JSON. No prose, no markdown.',
      userPrompt: prompt + `\n\nReturn ONLY JSON: {"body":"<rewritten text>"}`,
      maxTokens: 700,
    })
    return c.json({ body: out?.body?.trim() ?? body.text })
  })
}
