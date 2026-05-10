// Nomo — the agentic CRM copilot. Phase 8.1 + 8.2 (read tools).
//
// Endpoints (mounted under /api/nomo by server.ts):
//   POST  /api/nomo/chat   — SSE stream. Body: { thread_id?, message, lead_id? }.
//                             Streams tool_call + tool_result + delta + done events.
//   GET   /api/nomo/threads        — list the caller's threads
//   GET   /api/nomo/threads/:id    — full thread with messages
//   POST  /api/nomo/threads/:id/archive
//   DELETE /api/nomo/threads/:id
//
// Tool loop (Anthropic native API): we call /v1/messages with `tools`,
// inspect the response for tool_use blocks, execute them server-side,
// append tool_result blocks, call again. Up to MAX_TOOL_ROUNDS iterations.
// Final assistant text streams back as `delta` events for a snappy UX
// even though earlier rounds are non-streaming.

import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { supabase } from './supabase.js'
import { NOMO_TOOLS, findTool, anthropicToolSpec, openaiToolSpec } from './nomo-tools.js'

const JWT_SECRET = process.env.JWT_SECRET || ''
const MAX_TOOL_ROUNDS = 5

interface ThreadRow {
  id: string
  user_id: string | null
  title: string | null
  pinned_lead_id: string | null
  archived: boolean
  last_message_at: string
  created_at: string
}

interface NomoSettings {
  active_ai_provider: string
  active_ai_model: string
  anthropic_model: string
  openai_model: string
  openrouter_model: string
  company_name: string
  company_description: string
  usp: string
  scheduling_url: string
  ai_outreach_tone: string
  nomo_enabled: boolean
  nomo_mode: 'chat-only' | 'approval' | 'autopilot'
  nomo_system_prompt: string | null
}

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'nomo', ...extra, time: new Date().toISOString() }))
}

function b64urlDecode(s: string) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

async function verifyAndExtractUid(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const parts = m[1].split('.')
  if (parts.length !== 3) return null
  if (!JWT_SECRET) return null
  const crypto = await import('node:crypto')
  const expected = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${parts[0]}.${parts[1]}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (expected !== parts[2]) return null
  try {
    const claims = JSON.parse(b64urlDecode(parts[1])) as { sub?: string; exp?: number }
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null
    return claims.sub ?? null
  } catch { return null }
}

async function loadNomoSettings(): Promise<NomoSettings | null> {
  const { data } = await supabase
    .from('crm_runtime_settings')
    .select('active_ai_provider, active_ai_model, anthropic_model, openai_model, openrouter_model, company_name, company_description, usp, scheduling_url, ai_outreach_tone, nomo_enabled, nomo_mode, nomo_system_prompt')
    .eq('id', 1)
    .maybeSingle()
  return (data as NomoSettings | null) ?? null
}

async function getProviderKey(provider: string): Promise<string | null> {
  const { data } = await supabase
    .from('crm_provider_credentials')
    .select('api_key')
    .eq('provider', provider)
    .maybeSingle()
  return (data as { api_key: string | null } | null)?.api_key ?? null
}

function buildSystemPrompt(s: NomoSettings, pinnedLead?: Record<string, unknown> | null): string {
  const custom = (s.nomo_system_prompt ?? '').trim()
  const company = `Company: ${s.company_name || '(unnamed)'}.\n` +
                  `Description: ${s.company_description || '(none)'}\n` +
                  `Unique value: ${s.usp || '(none)'}\n` +
                  `Default outreach tone: ${s.ai_outreach_tone || 'professional'}\n` +
                  (s.scheduling_url ? `Scheduling URL: ${s.scheduling_url}\n` : '')
  const persona =
`You are Nomo, the in-app AI copilot for the ${s.company_name || 'imba'} CRM. You help the operator manage their pipeline.

Tools available:
${NOMO_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Always call the relevant tool to ground your answers in real data. Don't guess pipeline numbers — call get_metrics. Don't list leads from memory — call search_leads.
Use tools BEFORE replying. After receiving tool results, give the operator a concise, actionable summary (≤4 sentences + bullets where helpful).
Avoid restating raw IDs and timestamps unless the operator asks. Quote names and headline numbers.
When you suggest an action ("draft an email", "move stage to qualified"), SAY it — write tools land in the next sprint and the operator may ask you to do it manually for now.`
  const lead = pinnedLead
    ? `\n\nPinned lead context:\n${JSON.stringify(pinnedLead, null, 2)}`
    : ''
  return [persona, '', company, custom && `\nOperator instructions:\n${custom}`, lead].filter(Boolean).join('\n')
}

// ── Anthropic content block types ────────────────────────────────────
interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
interface AnthropicToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicBlock[]
}

// ── Chat handler ─────────────────────────────────────────────────────
export function mountNomoApi(app: Hono) {
  app.use('/api/nomo/*', async (c, next) => {
    const uid = await verifyAndExtractUid(c.req.header('authorization'))
    if (!uid) return c.json({ error: 'unauthorized' }, 401)
    c.set('uid' as never, uid as never)
    await next()
  })

  app.get('/api/nomo/threads', async c => {
    const uid = c.get('uid' as never) as string
    const { data } = await supabase
      .from('crm_nomo_threads')
      .select('id, title, pinned_lead_id, archived, last_message_at, created_at')
      .eq('user_id', uid)
      .eq('archived', false)
      .order('last_message_at', { ascending: false })
      .limit(50)
    return c.json({ threads: data ?? [] })
  })

  app.get('/api/nomo/threads/:id', async c => {
    const uid = c.get('uid' as never) as string
    const id  = c.req.param('id')
    const { data: thread } = await supabase
      .from('crm_nomo_threads')
      .select('id, user_id, title, pinned_lead_id, archived, last_message_at, created_at')
      .eq('id', id)
      .maybeSingle()
    if (!thread) return c.json({ error: 'not found' }, 404)
    if ((thread as ThreadRow).user_id && (thread as ThreadRow).user_id !== uid) {
      return c.json({ error: 'forbidden' }, 403)
    }
    const { data: msgs } = await supabase
      .from('crm_nomo_messages')
      .select('id, role, content, tool_calls, tool_results, status, model, tokens_in, tokens_out, cost_cents, created_at')
      .eq('thread_id', id)
      .order('created_at', { ascending: true })
      .limit(200)
    return c.json({ thread, messages: msgs ?? [] })
  })

  app.post('/api/nomo/threads/:id/archive', async c => {
    const uid = c.get('uid' as never) as string
    const id  = c.req.param('id')
    await supabase.from('crm_nomo_threads').update({ archived: true }).eq('id', id).eq('user_id', uid)
    return c.json({ ok: true })
  })

  app.delete('/api/nomo/threads/:id', async c => {
    const uid = c.get('uid' as never) as string
    const id  = c.req.param('id')
    await supabase.from('crm_nomo_threads').delete().eq('id', id).eq('user_id', uid)
    return c.json({ ok: true })
  })

  app.post('/api/nomo/chat', async c => {
    const uid = c.get('uid' as never) as string
    const body = await c.req.json().catch(() => ({})) as {
      thread_id?: string; message?: string; lead_id?: string
    }
    const userMessage = (body.message ?? '').trim()
    if (!userMessage) return c.json({ error: 'empty message' }, 400)

    const settings = await loadNomoSettings()
    if (!settings || !settings.nomo_enabled) {
      return c.json({ error: 'nomo disabled — enable in Settings → AI providers' }, 403)
    }

    let threadId = body.thread_id ?? null
    if (threadId) {
      const { data: t } = await supabase
        .from('crm_nomo_threads').select('id, user_id').eq('id', threadId).maybeSingle()
      const row = t as { id: string; user_id: string | null } | null
      if (!row || (row.user_id && row.user_id !== uid)) threadId = null
    }
    if (!threadId) {
      const { data: created } = await supabase.from('crm_nomo_threads').insert({
        user_id: uid,
        title: userMessage.slice(0, 80),
        pinned_lead_id: body.lead_id ?? null,
      }).select('id').maybeSingle()
      threadId = (created as { id: string } | null)?.id ?? null
      if (!threadId) return c.json({ error: 'failed to create thread' }, 500)
    }

    await supabase.from('crm_nomo_messages').insert({
      thread_id: threadId,
      role: 'user',
      content: userMessage.slice(0, 50_000),
    })

    const { data: history } = await supabase
      .from('crm_nomo_messages')
      .select('role, content, tool_calls, tool_results')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(50)
    const turns = (history as Array<{ role: string; content: string | null; tool_calls: AnthropicToolUseBlock[] | null; tool_results: AnthropicToolResultBlock[] | null }> | null) ?? []

    let pinnedLead: Record<string, unknown> | null = null
    if (body.lead_id) {
      const { data: l } = await supabase
        .from('crm_lead_360')
        .select('id, name, email, company, stage, fit_score, intent_score, engagement_score, deal_health, deal_health_reason, value, last_email_sent_at, total_replies')
        .eq('id', body.lead_id)
        .maybeSingle()
      pinnedLead = l as Record<string, unknown> | null
    }

    const systemPrompt = buildSystemPrompt(settings, pinnedLead)

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'thread', data: JSON.stringify({ thread_id: threadId }) })

      const provider = settings.active_ai_provider
      try {
        if (provider === 'anthropic') {
          await runAnthropicLoop({ stream, threadId: threadId!, settings, systemPrompt, turns, userMessage })
        } else if (provider === 'openai' || provider === 'openrouter') {
          await runOpenAICompatibleLoop({ stream, threadId: threadId!, settings, systemPrompt, turns, userMessage, provider })
        } else {
          throw new Error(`provider "${provider}" not yet wired in Nomo. Use anthropic / openai / openrouter.`)
        }
      } catch (err) {
        log('error', 'nomo chat failed', { error: (err as Error).message })
        await supabase.from('crm_nomo_messages').insert({
          thread_id: threadId,
          role: 'assistant',
          content: `_Nomo failed: ${(err as Error).message}_`,
          status: 'failed',
          error: (err as Error).message.slice(0, 500),
        })
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: (err as Error).message }) })
      }
    })
  })
}

// ── Anthropic tool loop ──────────────────────────────────────────────
interface LoopArgs {
  stream: { writeSSE: (e: { event: string; data: string }) => Promise<void> }
  threadId: string
  settings: NomoSettings
  systemPrompt: string
  turns: Array<{ role: string; content: string | null; tool_calls: AnthropicToolUseBlock[] | null; tool_results: AnthropicToolResultBlock[] | null }>
  userMessage: string
}

async function runAnthropicLoop({ stream, threadId, settings, systemPrompt, turns, userMessage }: LoopArgs) {
  const apiKey = await getProviderKey('anthropic')
  if (!apiKey) throw new Error('Anthropic API key not configured')
  const model = settings.anthropic_model || 'claude-sonnet-4-20250514'

  // Reconstruct the conversation as Anthropic-shaped messages including
  // any past tool calls/results so the model has full context.
  const messages: AnthropicMessage[] = []
  for (const t of turns) {
    if (t.role === 'user') {
      messages.push({ role: 'user', content: t.content ?? '' })
    } else if (t.role === 'assistant') {
      const blocks: AnthropicBlock[] = []
      if (t.content) blocks.push({ type: 'text', text: t.content })
      for (const tc of t.tool_calls ?? []) blocks.push(tc)
      messages.push({ role: 'assistant', content: blocks.length > 0 ? blocks : (t.content ?? '') })
    } else if (t.role === 'tool') {
      const blocks: AnthropicToolResultBlock[] = (t.tool_results ?? []) as AnthropicToolResultBlock[]
      if (blocks.length > 0) messages.push({ role: 'user', content: blocks })
    }
  }
  // Latest user message wasn't yet in history when we loaded turns
  // (we inserted it before reading) — wait, actually it WAS. Skip dup.
  // If somehow the last message isn't this user message, append:
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user' || messages[messages.length - 1].content !== userMessage) {
    // We loaded turns AFTER inserting the user row, so it should be there.
    // But guard against an empty history.
    if (messages.length === 0) messages.push({ role: 'user', content: userMessage })
  }

  let totalTokensIn = 0
  let totalTokensOut = 0
  let finalText = ''
  const persistedToolCalls: AnthropicToolUseBlock[] = []
  const persistedToolResults: AnthropicToolResultBlock[] = []

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: systemPrompt,
        messages,
        tools: anthropicToolSpec(),
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`anthropic ${res.status}: ${txt.slice(0, 300)}`)
    }
    const json = await res.json() as {
      content: AnthropicBlock[]
      stop_reason: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    totalTokensIn  += json.usage?.input_tokens  ?? 0
    totalTokensOut += json.usage?.output_tokens ?? 0

    // Stream any text the model produced this round.
    for (const block of json.content) {
      if (block.type === 'text' && block.text) {
        finalText += block.text
        // Chunk it so the UI feels responsive.
        for (const piece of chunk(block.text, 24)) {
          await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: piece }) })
        }
      }
    }

    // No tools → done.
    if (json.stop_reason !== 'tool_use') {
      // Persist the assistant message (text + any earlier tool_calls
      // were already persisted in the loop below).
      await supabase.from('crm_nomo_messages').insert({
        thread_id: threadId,
        role: 'assistant',
        content: finalText,
        tool_calls: persistedToolCalls,
        model,
        tokens_in:  totalTokensIn  || null,
        tokens_out: totalTokensOut || null,
      })
      // Auto-title on first reply.
      if (turns.filter(t => t.role === 'assistant').length === 0) {
        const title = (turns[0]?.content ?? userMessage).slice(0, 80)
        await supabase.from('crm_nomo_threads').update({ title }).eq('id', threadId).is('title', null)
      }
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ tokens_in: totalTokensIn, tokens_out: totalTokensOut, model }),
      })
      return
    }

    // Tool-use round: append assistant message with full content blocks
    // so the next request includes them, then execute each tool.
    messages.push({ role: 'assistant', content: json.content })

    const toolResults: AnthropicToolResultBlock[] = []
    for (const block of json.content) {
      if (block.type !== 'tool_use') continue
      const tu = block as AnthropicToolUseBlock
      persistedToolCalls.push(tu)
      await stream.writeSSE({
        event: 'tool_call',
        data: JSON.stringify({ id: tu.id, name: tu.name, input: tu.input }),
      })
      const tool = findTool(tu.name)
      let result: AnthropicToolResultBlock
      if (!tool) {
        result = { type: 'tool_result', tool_use_id: tu.id, content: `unknown tool: ${tu.name}`, is_error: true }
      } else {
        try {
          const out = await tool.run(tu.input)
          const json = JSON.stringify(out).slice(0, 100_000)
          result = { type: 'tool_result', tool_use_id: tu.id, content: json }
        } catch (err) {
          result = { type: 'tool_result', tool_use_id: tu.id, content: (err as Error).message, is_error: true }
        }
      }
      toolResults.push(result)
      persistedToolResults.push(result)
      await stream.writeSSE({
        event: 'tool_result',
        data: JSON.stringify({ tool_use_id: tu.id, content: result.content, is_error: result.is_error ?? false }),
      })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  // Hit MAX_TOOL_ROUNDS without finishing — bail.
  await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: `tool loop exceeded ${MAX_TOOL_ROUNDS} rounds` }) })
}

// ── OpenAI/OpenRouter tool loop ──────────────────────────────────────
interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

async function runOpenAICompatibleLoop(args: LoopArgs & { provider: 'openai' | 'openrouter' }) {
  const { stream, threadId, settings, systemPrompt, turns, userMessage, provider } = args
  const apiKey = await getProviderKey(provider)
  if (!apiKey) throw new Error(`${provider} API key not configured`)
  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions'
  const model = provider === 'openai'
    ? (settings.openai_model || 'gpt-4o-mini')
    : (settings.openrouter_model || 'anthropic/claude-sonnet-4')

  const messages: OAIMessage[] = [{ role: 'system', content: systemPrompt }]
  for (const t of turns) {
    if (t.role === 'user' || t.role === 'assistant') {
      messages.push({ role: t.role as 'user' | 'assistant', content: t.content ?? '' })
    }
  }
  if (messages[messages.length - 1].role !== 'user' || messages[messages.length - 1].content !== userMessage) {
    if (messages.length <= 1) messages.push({ role: 'user', content: userMessage })
  }

  let totalTokensIn = 0, totalTokensOut = 0
  let finalText = ''
  const persistedToolCalls: AnthropicToolUseBlock[] = []
  const persistedToolResults: AnthropicToolResultBlock[] = []

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...(provider === 'openrouter' ? {
          'HTTP-Referer': 'https://crm.imbaproduction.com',
          'X-Title': 'imba.crm Nomo',
        } : {}),
      },
      body: JSON.stringify({ model, messages, tools: openaiToolSpec(), tool_choice: 'auto' }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`${provider} ${res.status}: ${txt.slice(0, 300)}`)
    }
    const json = await res.json() as {
      choices?: Array<{ message: OAIMessage; finish_reason?: string }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    totalTokensIn  += json.usage?.prompt_tokens     ?? 0
    totalTokensOut += json.usage?.completion_tokens ?? 0
    const choice = json.choices?.[0]
    if (!choice) throw new Error(`${provider}: empty choice`)

    if (choice.message.content) {
      finalText += choice.message.content
      for (const piece of chunk(choice.message.content, 24)) {
        await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: piece }) })
      }
    }

    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
      await supabase.from('crm_nomo_messages').insert({
        thread_id: threadId,
        role: 'assistant',
        content: finalText,
        tool_calls: persistedToolCalls,
        model,
        tokens_in:  totalTokensIn  || null,
        tokens_out: totalTokensOut || null,
      })
      if (turns.filter(t => t.role === 'assistant').length === 0) {
        const title = (turns[0]?.content ?? userMessage).slice(0, 80)
        await supabase.from('crm_nomo_threads').update({ title }).eq('id', threadId).is('title', null)
      }
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ tokens_in: totalTokensIn, tokens_out: totalTokensOut, model }),
      })
      return
    }

    messages.push({
      role: 'assistant',
      content: choice.message.content ?? null,
      tool_calls: choice.message.tool_calls,
    })

    for (const call of choice.message.tool_calls) {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(call.function.arguments) } catch { /* tolerate */ }
      const tu: AnthropicToolUseBlock = { type: 'tool_use', id: call.id, name: call.function.name, input }
      persistedToolCalls.push(tu)
      await stream.writeSSE({
        event: 'tool_call',
        data: JSON.stringify({ id: call.id, name: call.function.name, input }),
      })
      const tool = findTool(call.function.name)
      let resultText: string
      let isError = false
      if (!tool) { resultText = `unknown tool: ${call.function.name}`; isError = true }
      else {
        try { resultText = JSON.stringify(await tool.run(input)).slice(0, 100_000) }
        catch (err) { resultText = (err as Error).message; isError = true }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: resultText })
      persistedToolResults.push({ type: 'tool_result', tool_use_id: call.id, content: resultText, is_error: isError })
      await stream.writeSSE({
        event: 'tool_result',
        data: JSON.stringify({ tool_use_id: call.id, content: resultText, is_error: isError }),
      })
    }
  }
  await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: `tool loop exceeded ${MAX_TOOL_ROUNDS} rounds` }) })
}

function chunk(s: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out
}

declare module 'hono' {
  interface ContextVariableMap { uid: string }
}
