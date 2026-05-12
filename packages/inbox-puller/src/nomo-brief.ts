// Nomo Daily Brief — GET /api/nomo/brief
//
// Composes a short, action-oriented summary of what the operator should
// look at TODAY. Runs three tools server-side (get_metrics, summarize_period
// for the last 24h, find_recent_signals) and asks the model to crunch
// them into a structured brief:
//
//   {
//     headline: "3 hot leads need attention today",
//     stats:    [{ label, value, hint? }],
//     actions:  [{ text, prompt, severity }]
//   }
//
// Each action carries a `prompt` the SPA can drop into the chat composer
// so a single click opens Nomo pre-typed with a follow-up question. No
// extra writes happen here — just composition.

import type { Hono } from 'hono'
import { supabase } from './supabase.js'
import { findTool } from './nomo-tools.js'

interface BriefStat { label: string; value: string; hint?: string }
interface BriefAction { text: string; prompt: string; severity: 'info' | 'warning' | 'success' }
interface Brief {
  headline: string
  stats: BriefStat[]
  actions: BriefAction[]
  generated_at: string
  model?: string
}

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
    console.warn(JSON.stringify({ level: 'warn', msg: 'invalid jwt — payload decode failed', source: 'nomo-brief', error: (e as Error).message, time: new Date().toISOString() }))
    return null
  }
}

async function loadSettings() {
  const { data } = await supabase
    .from('crm_runtime_settings')
    .select('active_ai_provider, active_ai_model, anthropic_model, openai_model, openrouter_model, company_name, nomo_enabled')
    .eq('id', 1)
    .maybeSingle()
  return data as {
    active_ai_provider: string; active_ai_model: string
    anthropic_model: string; openai_model: string; openrouter_model: string
    company_name: string; nomo_enabled: boolean
  } | null
}

async function getKey(provider: string): Promise<string | null> {
  const { data } = await supabase.from('crm_provider_credentials').select('api_key').eq('provider', provider).maybeSingle()
  return (data as { api_key: string | null } | null)?.api_key ?? null
}

export function mountNomoBrief(app: Hono) {
  app.get('/api/nomo/brief', async c => {
    const uid = await verifyAuth(c.req.header('authorization'))
    if (!uid) return c.json({ error: 'unauthorized' }, 401)

    const settings = await loadSettings()
    if (!settings || !settings.nomo_enabled) return c.json({ error: 'nomo disabled' }, 403)

    // Run the three tools deterministically — no AI cost yet.
    const metrics = await findTool('get_metrics')!.run({ period: 'this_week' }) as Record<string, unknown>
    const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString()
    const summary = await findTool('summarize_period')!.run({ from: yesterday }) as Record<string, unknown>
    const signals = await findTool('find_recent_signals')!.run({ hours: 24 }) as Record<string, unknown>

    // Open hot-lead alerts (last 48h, unread) — operator-friendly action source.
    const { data: alerts } = await supabase
      .from('crm_hot_lead_alerts')
      .select('id, lead_id, reason, fit_score, intent_score, created_at')
      .is('read_at', null)
      .gte('created_at', new Date(Date.now() - 48 * 3600_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(8)

    // Red deal-health leads.
    const { data: redLeads } = await supabase
      .from('crm_leads')
      .select('id, name, company, stage, deal_health_reason')
      .eq('deal_health', 'red')
      .not('stage', 'in', '(won,lost)')
      .order('stage_entered_at', { ascending: true, nullsFirst: false })
      .limit(5)

    // Build the brief — let the model phrase it human-like, with the
    // raw numbers as ground truth so it can't hallucinate counts.
    const brief = await composeBrief({
      settings,
      metrics, summary, signals,
      alerts:   alerts   ?? [],
      redLeads: redLeads ?? [],
    })

    return c.json(brief)
  })
}

async function composeBrief(args: {
  settings: { active_ai_provider: string; anthropic_model: string; openai_model: string; openrouter_model: string; company_name: string }
  metrics: Record<string, unknown>
  summary: Record<string, unknown>
  signals: Record<string, unknown>
  alerts: Array<{ id: string; lead_id: string; reason: string; fit_score: number | null; intent_score: number | null }>
  redLeads: Array<{ id: string; name: string; company: string | null; stage: string; deal_health_reason: string | null }>
}): Promise<Brief> {
  const { settings, metrics, summary, signals, alerts, redLeads } = args
  const generatedAt = new Date().toISOString()

  // Always-shown stats. The model only writes prose around them.
  const stats: BriefStat[] = [
    { label: 'Pipeline value',
      value: `$${(metrics.pipeline_value as number ?? 0).toLocaleString()}`,
      hint:  'this week' },
    { label: 'New leads',
      value: String((summary.new_leads as { count?: number } | undefined)?.count ?? 0),
      hint:  'last 24h' },
    { label: 'Replies in',
      value: String((summary.replies as { count?: number } | undefined)?.count ?? 0),
      hint:  'last 24h' },
    { label: 'Hot signals',
      value: String((signals.inbound as { count?: number } | undefined)?.count ?? 0),
      hint:  'inbound · last 24h' },
  ]

  // Pre-populate concrete actions BEFORE asking the model — this way
  // we always get useful buttons even if the LLM is down.
  const actions: BriefAction[] = []
  for (const a of alerts.slice(0, 3)) {
    actions.push({
      text: `${a.reason} — fit ${a.fit_score ?? '–'} / intent ${a.intent_score ?? '–'}`,
      prompt: `Open lead ${a.lead_id}, summarise what's happening, and suggest the next action.`,
      severity: 'warning',
    })
  }
  for (const l of redLeads.slice(0, 3 - actions.length)) {
    actions.push({
      text: `${l.company || l.name} stalling in ${l.stage} — ${l.deal_health_reason ?? 'low momentum'}`,
      prompt: `Open lead ${l.id} and tell me what to do next: revive, demote, or breakup email.`,
      severity: 'warning',
    })
  }
  if ((summary.replies as { count?: number } | undefined)?.count) {
    actions.push({
      text: `${(summary.replies as { count: number }).count} new replies — triage them`,
      prompt: `Show me the inbound replies from the last 24h and suggest a draft response for the top three.`,
      severity: 'info',
    })
  }
  // Cap at 4 actions to keep the card scannable.
  while (actions.length > 4) actions.pop()

  // Now the model picks a headline. Cheap call (max 200 tokens).
  let headline = 'Your pipeline at a glance'
  let model: string | undefined
  try {
    const result = await composeHeadline({
      settings,
      stats,
      actions,
      summary,
    })
    headline = result.headline
    model    = result.model
  } catch (err) {
    // No-op — keep the default headline if the model is unavailable.
    headline = `${stats[0].value} pipeline · ${stats[1].value} new leads · ${stats[2].value} replies in last 24h`
    void err
  }

  return { headline, stats, actions, generated_at: generatedAt, model }
}

async function composeHeadline({ settings, stats, actions, summary }: {
  settings: { active_ai_provider: string; anthropic_model: string; openai_model: string; openrouter_model: string; company_name: string }
  stats: BriefStat[]
  actions: BriefAction[]
  summary: Record<string, unknown>
}): Promise<{ headline: string; model: string }> {
  const provider = settings.active_ai_provider
  const userPrompt = `Write a single one-line headline (≤90 chars) for ${settings.company_name || 'our'} CRM operator opening their dashboard right now. Tone: concise, energetic, action-first. No emoji.

Numbers I have:
- pipeline value: ${stats[0].value} (this week)
- new leads (24h): ${stats[1].value}
- replies in (24h): ${stats[2].value}
- hot signals (24h): ${stats[3].value}
- pending actions: ${actions.length}
- won deals (24h): ${(summary.won_deals as { count?: number } | undefined)?.count ?? 0}

Examples of good headlines:
- "3 hot leads need attention today"
- "Pipeline up 12% this week — start with the top of qualified"
- "Quiet morning — clear yesterday's 4 unanswered replies"

Return ONLY the headline string, no quotes.`

  if (provider === 'anthropic') {
    const apiKey = await getKey('anthropic')
    if (!apiKey) throw new Error('no anthropic key')
    const model = settings.anthropic_model || 'claude-sonnet-4-20250514'
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 80, messages: [{ role: 'user', content: userPrompt }] }),
    })
    if (!res.ok) throw new Error(`anthropic ${res.status}`)
    const json = await res.json() as { content?: Array<{ type: string; text: string }> }
    const text = json.content?.find(b => b.type === 'text')?.text?.trim().replace(/^"|"$/g, '') ?? ''
    return { headline: text || 'Your pipeline at a glance', model }
  }

  if (provider === 'openai' || provider === 'openrouter') {
    const apiKey = await getKey(provider)
    if (!apiKey) throw new Error(`no ${provider} key`)
    const model = provider === 'openai'
      ? (settings.openai_model || 'gpt-4o-mini')
      : (settings.openrouter_model || 'anthropic/claude-sonnet-4')
    const url = provider === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json',
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://crm.imbaproduction.com', 'X-Title': 'imba.crm Nomo' } : {}),
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: userPrompt }], max_tokens: 80 }),
    })
    if (!res.ok) throw new Error(`${provider} ${res.status}`)
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const text = (json.choices?.[0]?.message?.content ?? '').trim().replace(/^"|"$/g, '')
    return { headline: text || 'Your pipeline at a glance', model }
  }

  throw new Error(`provider ${provider} not wired for brief`)
}
