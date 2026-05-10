// Nomo tool registry — Phase 8.2 read tools.
//
// Each tool is { name, description, input_schema, run }. The chat endpoint
// passes the schemas to the AI provider's tool-calling API; when the
// model decides to invoke one, it streams `tool_call` events back, executes
// `run()` server-side with the worker's service-role supabase client,
// streams a `tool_result` event, and loops.
//
// Read-only this sprint — write tools (enqueue_agent, move_lead_stage, …)
// land in 8.3 with their approval cards.

import { supabase } from './supabase.js'

export interface NomoTool {
  name: string
  description: string
  input_schema: Record<string, unknown>   // JSON Schema for the model
  /** Execute the tool. Return the JSON-serialisable result the model
   *  will see (and the operator will see rendered inline). */
  run: (input: Record<string, unknown>) => Promise<unknown>
}

// ── search_leads ─────────────────────────────────────────────────────
const searchLeads: NomoTool = {
  name: 'search_leads',
  description:
    'Search leads by free-text query (matches name/company/email), and/or by stage and minimum fit/intent scores. Returns id, name, company, stage, scores, deal health, and value so you can rank them.',
  input_schema: {
    type: 'object',
    properties: {
      query:      { type: 'string', description: 'Free text matched against name, company, email.' },
      stage:      { type: 'string', enum: ['new','qualified','proposal','negotiation','won','lost'] },
      fit_min:    { type: 'number', minimum: 0, maximum: 100 },
      intent_min: { type: 'number', minimum: 0, maximum: 100 },
      limit:      { type: 'number', minimum: 1, maximum: 50, default: 10 },
    },
  },
  async run(input) {
    const limit = Math.min(50, Math.max(1, Number(input.limit ?? 10)))
    let q = supabase
      .from('crm_lead_360')
      .select('id, name, email, company, stage, fit_score, intent_score, engagement_score, deal_health, value, last_email_sent_at, total_replies')
      .order('intent_score', { ascending: false, nullsFirst: false })
      .limit(limit)
    if (input.stage)      q = q.eq('stage', String(input.stage))
    if (input.fit_min   != null) q = q.gte('fit_score',    Number(input.fit_min))
    if (input.intent_min != null) q = q.gte('intent_score', Number(input.intent_min))
    if (input.query) {
      const term = `%${String(input.query).replace(/[%_]/g, '')}%`
      q = q.or(`name.ilike.${term},company.ilike.${term},email.ilike.${term}`)
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return { count: (data ?? []).length, leads: data ?? [] }
  },
}

// ── get_lead ─────────────────────────────────────────────────────────
const getLead: NomoTool = {
  name: 'get_lead',
  description:
    'Full context for a single lead: profile, scores, deal health, recent activities, recent messages, exit checklist. Use this when the operator names a specific lead or you need detail to decide what to do next.',
  input_schema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'crm_leads.id (uuid)' } },
    required: ['id'],
  },
  async run(input) {
    const id = String(input.id)
    const [lead, activities, messages, attempts] = await Promise.all([
      supabase.from('crm_lead_360').select('*').eq('id', id).maybeSingle(),
      supabase.from('crm_activities').select('id, type, subject, body, created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(8),
      supabase.from('crm_inbox_messages').select('id, direction, subject, ai_category, ai_sentiment, received_at').eq('lead_id', id).order('received_at', { ascending: false }).limit(8),
      supabase.from('crm_outreach_attempts').select('id, channel, status, sent_at, responded_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(8),
    ])
    if (!lead.data) throw new Error(`lead ${id} not found`)
    return {
      lead:        lead.data,
      activities:  activities.data ?? [],
      messages:    messages.data ?? [],
      attempts:    attempts.data ?? [],
    }
  },
}

// ── query_pipeline ───────────────────────────────────────────────────
const queryPipeline: NomoTool = {
  name: 'query_pipeline',
  description:
    'Group leads by stage with totals. Use this for "what does my pipeline look like" / "how much is in negotiation" questions.',
  input_schema: {
    type: 'object',
    properties: {
      value_min: { type: 'number', description: 'Filter to leads with value ≥ this (in dollars).' },
    },
  },
  async run(input) {
    let q = supabase.from('crm_lead_360').select('stage, value, fit_score, intent_score, deal_health')
    if (input.value_min != null) q = q.gte('value', Number(input.value_min))
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{ stage: string; value: number | null; fit_score: number | null; intent_score: number | null; deal_health: string | null }>
    const byStage: Record<string, { count: number; value: number; avg_fit: number; avg_intent: number; red: number; yellow: number; green: number }> = {}
    for (const r of rows) {
      const s = r.stage || 'unknown'
      if (!byStage[s]) byStage[s] = { count: 0, value: 0, avg_fit: 0, avg_intent: 0, red: 0, yellow: 0, green: 0 }
      byStage[s].count++
      byStage[s].value   += r.value ?? 0
      byStage[s].avg_fit    += r.fit_score    ?? 0
      byStage[s].avg_intent += r.intent_score ?? 0
      const h = r.deal_health
      if (h === 'red')         byStage[s].red++
      else if (h === 'yellow') byStage[s].yellow++
      else                     byStage[s].green++
    }
    for (const s of Object.keys(byStage)) {
      const b = byStage[s]
      b.avg_fit    = b.count ? Math.round(b.avg_fit    / b.count) : 0
      b.avg_intent = b.count ? Math.round(b.avg_intent / b.count) : 0
    }
    return { total: rows.length, by_stage: byStage }
  },
}

// ── get_metrics ──────────────────────────────────────────────────────
const getMetrics: NomoTool = {
  name: 'get_metrics',
  description:
    'Top-line metrics for a period: total leads, pipeline value, won value, win rate, AI spend so far this month. Period defaults to "this_month".',
  input_schema: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['today','this_week','this_month','this_quarter','all_time'], default: 'this_month' },
    },
  },
  async run(input) {
    const period = (input.period as string) ?? 'this_month'
    const since = periodStart(period)

    const [leadsRes, attemptsRes, costRes] = await Promise.all([
      supabase.from('crm_leads').select('id, stage, value, probability, created_at').gte(period === 'all_time' ? 'created_at' : 'created_at', since.toISOString()),
      supabase.from('crm_outreach_attempts').select('status, responded_at, sent_at').gte('created_at', since.toISOString()),
      supabase.from('ai_generations').select('cost_cents').gte('created_at', monthStart().toISOString()),
    ])
    const leads = (leadsRes.data ?? []) as Array<{ stage: string; value: number | null; probability: number | null }>
    const attempts = (attemptsRes.data ?? []) as Array<{ status: string; responded_at: string | null; sent_at: string | null }>
    const ai = (costRes.data ?? []) as Array<{ cost_cents: number | null }>

    const won  = leads.filter(l => l.stage === 'won')
    const lost = leads.filter(l => l.stage === 'lost')
    const closedDeals = won.length + lost.length
    const winRate = closedDeals > 0 ? Math.round((won.length / closedDeals) * 100) : null
    const pipelineValue = leads.filter(l => !['won', 'lost'].includes(l.stage))
      .reduce((s, l) => s + (l.value ?? 0), 0)
    const wonValue = won.reduce((s, l) => s + (l.value ?? 0), 0)
    const sent = attempts.filter(a => a.sent_at).length
    const responded = attempts.filter(a => a.responded_at).length
    const aiSpendCents = ai.reduce((s, r) => s + (r.cost_cents ?? 0), 0)

    return {
      period,
      since: since.toISOString(),
      total_leads:        leads.length,
      pipeline_value:     pipelineValue,
      won_value:          wonValue,
      win_rate_pct:       winRate,
      outreach_sent:      sent,
      outreach_response_rate_pct: sent ? Math.round((responded / sent) * 100) : null,
      ai_spend_this_month_usd: (aiSpendCents / 100).toFixed(2),
    }
  },
}

// ── summarize_period ─────────────────────────────────────────────────
const summarizePeriod: NomoTool = {
  name: 'summarize_period',
  description:
    'Summarise CRM activity for a date range: new leads, replies received, meetings booked, deals won. Returns counts + a few sample IDs so you can dig into specifics if needed.',
  input_schema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'ISO date (yyyy-mm-dd) inclusive lower bound.' },
      to:   { type: 'string', description: 'ISO date inclusive upper bound. Default: now.' },
    },
    required: ['from'],
  },
  async run(input) {
    const from = new Date(String(input.from))
    const to = input.to ? new Date(String(input.to)) : new Date()
    if (isNaN(from.getTime())) throw new Error('invalid `from` date')

    const [newLeads, repliesRes, meetingsRes, wonRes] = await Promise.all([
      supabase.from('crm_leads').select('id, name, company, created_at')
        .gte('created_at', from.toISOString()).lte('created_at', to.toISOString())
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('crm_inbox_messages').select('id, lead_id, subject, received_at')
        .eq('direction', 'inbound')
        .gte('received_at', from.toISOString()).lte('received_at', to.toISOString())
        .order('received_at', { ascending: false }).limit(20),
      supabase.from('crm_activities').select('id, lead_id, subject, created_at')
        .eq('type', 'meeting')
        .gte('created_at', from.toISOString()).lte('created_at', to.toISOString())
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('crm_leads').select('id, name, company, value, updated_at')
        .eq('stage', 'won').gte('updated_at', from.toISOString()).lte('updated_at', to.toISOString())
        .order('updated_at', { ascending: false }).limit(20),
    ])
    return {
      from: from.toISOString(),
      to:   to.toISOString(),
      new_leads:       { count: (newLeads.data ?? []).length, sample: newLeads.data ?? [] },
      replies:         { count: (repliesRes.data ?? []).length, sample: repliesRes.data ?? [] },
      meetings:        { count: (meetingsRes.data ?? []).length, sample: meetingsRes.data ?? [] },
      won_deals:       { count: (wonRes.data ?? []).length, sample: wonRes.data ?? [] },
    }
  },
}

// ── find_recent_signals ──────────────────────────────────────────────
const findRecentSignals: NomoTool = {
  name: 'find_recent_signals',
  description:
    'Pull recent intent signals (page visits, email opens/clicks, replies) for a single lead or across the org. Use this when the operator asks "who\'s hot right now" / "what has Acme been doing".',
  input_schema: {
    type: 'object',
    properties: {
      lead_id: { type: 'string', description: 'Optional: only signals for this lead.' },
      hours:   { type: 'number', default: 48, minimum: 1, maximum: 720 },
    },
  },
  async run(input) {
    const hours = Math.min(720, Math.max(1, Number(input.hours ?? 48)))
    const since = new Date(Date.now() - hours * 3600_000).toISOString()

    let visitQ = supabase.from('crm_visitor_events').select('id, lead_id, url, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(30)
    if (input.lead_id) visitQ = visitQ.eq('lead_id', String(input.lead_id))

    let openQ = supabase.from('crm_email_events').select('email_id, event_type, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(30)

    let inboxQ = supabase.from('crm_inbox_messages').select('id, lead_id, subject, ai_category, received_at').eq('direction', 'inbound').gte('received_at', since).order('received_at', { ascending: false }).limit(20)
    if (input.lead_id) inboxQ = inboxQ.eq('lead_id', String(input.lead_id))

    const [visits, opens, inbound] = await Promise.all([visitQ, openQ, inboxQ])
    return {
      since,
      hours,
      visits:   { count: (visits.data ?? []).length, sample: visits.data ?? [] },
      opens:    { count: (opens.data ?? []).length, sample: opens.data ?? [] },
      inbound:  { count: (inbound.data ?? []).length, sample: inbound.data ?? [] },
    }
  },
}

// ── Registry ─────────────────────────────────────────────────────────
export const NOMO_TOOLS: NomoTool[] = [
  searchLeads,
  getLead,
  queryPipeline,
  getMetrics,
  summarizePeriod,
  findRecentSignals,
]

export function findTool(name: string): NomoTool | undefined {
  return NOMO_TOOLS.find(t => t.name === name)
}

export function anthropicToolSpec(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return NOMO_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }))
}

export function openaiToolSpec(): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  return NOMO_TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))
}

// ── Helpers ──────────────────────────────────────────────────────────
function periodStart(period: string): Date {
  const now = new Date()
  if (period === 'today') {
    const d = new Date(now); d.setHours(0,0,0,0); return d
  }
  if (period === 'this_week') {
    const d = new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay()); return d
  }
  if (period === 'this_quarter') {
    const d = new Date(now); d.setHours(0,0,0,0); d.setDate(1)
    d.setMonth(Math.floor(d.getMonth() / 3) * 3); return d
  }
  if (period === 'all_time') {
    return new Date('2020-01-01')
  }
  return monthStart()
}
function monthStart(): Date {
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(1); return d
}
