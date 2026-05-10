// Nomo — the agentic CRM copilot. Phases 8.1 + 8.2 + 8.3.
//
// Endpoints (mounted under /api/nomo by server.ts):
//   POST  /api/nomo/chat                  — start a turn (SSE stream)
//   POST  /api/nomo/approve               — approve / reject a paused write tool (SSE stream)
//   GET   /api/nomo/threads               — list the caller's threads
//   GET   /api/nomo/threads/:id           — full thread with messages
//   POST  /api/nomo/threads/:id/archive
//   DELETE /api/nomo/threads/:id
//
// Tool-loop flow:
//   1. /chat persists the user message, builds the message history,
//      calls the AI provider with `tools`.
//   2. For each tool_use block in the response we decide auto-run vs
//      pause-for-approval based on tool.write × nomo_mode ×
//      nomo_autopilot_tools.
//   3. Read tools (and write tools whitelisted in autopilot mode) run
//      inline. The tool_call + tool_result are emitted as SSE events
//      and persisted into the assistant message's `tool_calls` jsonb.
//   4. Write tools that need approval pause the loop: we persist an
//      `awaiting_approval` assistant message with the still-pending
//      tool_calls, emit an `awaiting_approval` SSE event, and return.
//   5. The operator clicks Approve / Reject in the chat → POST
//      /api/nomo/approve with the tool_use_id. We run the tool (or
//      record a rejection) and then resume the loop by feeding
//      tool_results back to the model — same SSE shape, fresh stream.
//
// Storage shape inside crm_nomo_messages.tool_calls (jsonb array):
//   [{ id, name, input, status, result?, is_error?, approved_at?, approved_by? }]
// `status` ∈ done | awaiting_approval | approved | rejected | failed.

import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { supabase } from './supabase.js'
import { NOMO_TOOLS, findTool, anthropicToolSpec, openaiToolSpec, type NomoTool } from './nomo-tools.js'

const JWT_SECRET = process.env.JWT_SECRET || ''
const MAX_TOOL_ROUNDS = 6

type Mode = 'chat-only' | 'approval' | 'autopilot'

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
  nomo_mode: Mode
  nomo_autopilot_tools: string[]
  nomo_system_prompt: string | null
}

interface ToolCallEntry {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'done' | 'awaiting_approval' | 'approved' | 'rejected' | 'failed'
  result?: string
  is_error?: boolean
  approved_by?: string
  approved_at?: string
}

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
interface AnthropicToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock

interface AnthropicMessage { role: 'user' | 'assistant'; content: string | AnthropicBlock[] }

interface PersistedMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls: ToolCallEntry[] | null
  status: string
}

type StreamSink = { writeSSE: (e: { event: string; data: string }) => Promise<void> }

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'nomo', ...extra, time: new Date().toISOString() }))
}

function b64urlDecode(s: string) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

async function verifyAndExtractClaims(authHeader: string | undefined): Promise<{ uid: string; isAdmin: boolean } | null> {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const parts = m[1].split('.')
  if (parts.length !== 3 || !JWT_SECRET) return null
  const crypto = await import('node:crypto')
  const expected = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${parts[0]}.${parts[1]}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (expected !== parts[2]) return null
  try {
    const c = JSON.parse(b64urlDecode(parts[1])) as { sub?: string; exp?: number; app_metadata?: { role?: string }; user_metadata?: { role?: string } }
    if (typeof c.exp === 'number' && c.exp * 1000 < Date.now()) return null
    if (!c.sub) return null
    const isAdmin = c.app_metadata?.role === 'admin' || c.user_metadata?.role === 'admin'
    return { uid: c.sub, isAdmin }
  } catch { return null }
}

async function loadNomoSettings(): Promise<NomoSettings | null> {
  const { data } = await supabase
    .from('crm_runtime_settings')
    .select('active_ai_provider, active_ai_model, anthropic_model, openai_model, openrouter_model, company_name, company_description, usp, scheduling_url, ai_outreach_tone, nomo_enabled, nomo_mode, nomo_autopilot_tools, nomo_system_prompt')
    .eq('id', 1)
    .maybeSingle()
  const row = data as (NomoSettings & { nomo_autopilot_tools: unknown }) | null
  if (!row) return null
  if (!Array.isArray(row.nomo_autopilot_tools)) row.nomo_autopilot_tools = []
  return row
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

You have a tool registry; CALL the relevant tool to ground every answer in real data.
- Read tools (search_leads, get_lead, query_pipeline, get_metrics, summarize_period, find_recent_signals) run instantly.
- Write tools (enqueue_agent, move_lead_stage, add_activity, set_follow_up, tick_exit_checklist, assign_lead) PROPOSE the action; in default approval mode the operator clicks Approve to execute. State briefly what each write will do before you call it.
- If a write tool returns ok=false (e.g. move_lead_stage blocked by a missing exit checklist key), explain what's missing and offer to fix it via tick_exit_checklist.
- Be concise. ≤4 sentences + bullets where helpful. Don't restate raw IDs/timestamps unless asked.

Tools:
${NOMO_TOOLS.map(t => `- ${t.name}${t.write ? ' [write]' : ''}: ${t.description.split('. ')[0]}.`).join('\n')}`
  const lead = pinnedLead
    ? `\n\nPinned lead context:\n${JSON.stringify(pinnedLead, null, 2)}`
    : ''
  return [persona, '', company, custom && `\nOperator instructions:\n${custom}`, lead].filter(Boolean).join('\n')
}

function canRunWriteAutomatically(tool: NomoTool, mode: Mode, allowlist: string[], isAdmin: boolean): { ok: boolean; reason?: string } {
  if (tool.admin_only && !isAdmin) return { ok: false, reason: 'admin_only' }
  if (!tool.write) return { ok: true }
  if (mode === 'chat-only') return { ok: false, reason: 'chat_only' }
  if (mode === 'approval')  return { ok: false, reason: 'approval_required' }
  // autopilot
  if (allowlist.includes(tool.name)) return { ok: true }
  return { ok: false, reason: 'not_in_allowlist' }
}

// ── Mount ─────────────────────────────────────────────────────────────
export function mountNomoApi(app: Hono) {
  app.use('/api/nomo/*', async (c, next) => {
    const claims = await verifyAndExtractClaims(c.req.header('authorization'))
    if (!claims) return c.json({ error: 'unauthorized' }, 401)
    c.set('uid' as never, claims.uid as never)
    c.set('isAdmin' as never, claims.isAdmin as never)
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
    const t = thread as { user_id: string | null }
    if (t.user_id && t.user_id !== uid) return c.json({ error: 'forbidden' }, 403)
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
    await supabase.from('crm_nomo_threads').update({ archived: true }).eq('id', c.req.param('id')).eq('user_id', uid)
    return c.json({ ok: true })
  })

  app.delete('/api/nomo/threads/:id', async c => {
    const uid = c.get('uid' as never) as string
    await supabase.from('crm_nomo_threads').delete().eq('id', c.req.param('id')).eq('user_id', uid)
    return c.json({ ok: true })
  })

  // ── /chat ─────────────────────────────────────────────────────────────
  app.post('/api/nomo/chat', async c => {
    const uid     = c.get('uid' as never) as string
    const isAdmin = c.get('isAdmin' as never) as boolean
    const body = await c.req.json().catch(() => ({})) as { thread_id?: string; message?: string; lead_id?: string }
    const userMessage = (body.message ?? '').trim()
    if (!userMessage) return c.json({ error: 'empty message' }, 400)

    const settings = await loadNomoSettings()
    if (!settings || !settings.nomo_enabled) {
      return c.json({ error: 'nomo disabled — enable in Settings → AI providers' }, 403)
    }

    const threadId = await ensureThread(uid, body.thread_id ?? null, body.lead_id ?? null, userMessage)
    if (!threadId) return c.json({ error: 'failed to create thread' }, 500)

    await supabase.from('crm_nomo_messages').insert({
      thread_id: threadId,
      role: 'user',
      content: userMessage.slice(0, 50_000),
    })

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'thread', data: JSON.stringify({ thread_id: threadId }) })
      try {
        const pinnedLead = await loadPinnedLead(body.lead_id ?? null)
        const systemPrompt = buildSystemPrompt(settings, pinnedLead)
        const history = await loadThreadHistory(threadId)
        await runChatLoop({ stream, threadId, uid, isAdmin, settings, systemPrompt, history })
      } catch (err) {
        await emitError(stream, threadId, err as Error)
      }
    })
  })

  // ── /approve ──────────────────────────────────────────────────────────
  app.post('/api/nomo/approve', async c => {
    const uid     = c.get('uid' as never) as string
    const isAdmin = c.get('isAdmin' as never) as boolean
    const body = await c.req.json().catch(() => ({})) as {
      thread_id?: string
      message_id?: string
      tool_use_id?: string
      decision?: 'approve' | 'reject'
      edited_input?: Record<string, unknown>
    }
    if (!body.thread_id || !body.message_id || !body.tool_use_id || !body.decision) {
      return c.json({ error: 'thread_id, message_id, tool_use_id, decision required' }, 400)
    }

    const settings = await loadNomoSettings()
    if (!settings) return c.json({ error: 'no runtime settings' }, 500)

    // Confirm thread ownership.
    const { data: thread } = await supabase
      .from('crm_nomo_threads').select('id, user_id').eq('id', body.thread_id).maybeSingle()
    const t = thread as { user_id: string | null } | null
    if (!t || (t.user_id && t.user_id !== uid)) return c.json({ error: 'forbidden' }, 403)

    // Load the awaiting_approval message.
    const { data: msg } = await supabase
      .from('crm_nomo_messages')
      .select('id, role, content, tool_calls, status, thread_id')
      .eq('id', body.message_id)
      .maybeSingle()
    const m = msg as PersistedMessage | null
    if (!m || m.thread_id !== body.thread_id) return c.json({ error: 'message not found' }, 404)
    if (m.status !== 'awaiting_approval') return c.json({ error: 'not awaiting approval' }, 409)

    const calls: ToolCallEntry[] = m.tool_calls ?? []
    const target = calls.find(t => t.id === body.tool_use_id)
    if (!target) return c.json({ error: 'tool_use_id not in this message' }, 404)
    if (target.status !== 'awaiting_approval') return c.json({ error: 'tool already decided' }, 409)

    // Apply decision to this one tool call.
    if (body.decision === 'reject') {
      target.status = 'rejected'
      target.result = 'Operator rejected this action.'
      target.is_error = true
      target.approved_by = uid
      target.approved_at = new Date().toISOString()
    } else {
      const tool = findTool(target.name)
      if (!tool) {
        target.status = 'failed'
        target.result = `unknown tool: ${target.name}`
        target.is_error = true
      } else if (tool.admin_only && !isAdmin) {
        target.status = 'failed'
        target.result = 'Admin-only tool; current user is not an admin.'
        target.is_error = true
      } else {
        try {
          const input = body.edited_input ?? target.input
          target.input = input            // persist any operator edits
          const out = await tool.run(input)
          target.status = 'approved'
          target.result = JSON.stringify(out).slice(0, 100_000)
          target.is_error = false
        } catch (err) {
          target.status = 'failed'
          target.result = (err as Error).message
          target.is_error = true
        }
      }
      target.approved_by = uid
      target.approved_at = new Date().toISOString()
    }

    // Persist updated tool_calls.
    const stillPending = calls.some(t => t.status === 'awaiting_approval')
    await supabase.from('crm_nomo_messages').update({
      tool_calls: calls,
      status: stillPending ? 'awaiting_approval' : 'done',
    }).eq('id', m.id)

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'tool_result',
        data: JSON.stringify({
          tool_use_id: target.id, content: target.result ?? '',
          is_error: !!target.is_error, status: target.status,
        }),
      })

      if (stillPending) {
        await stream.writeSSE({
          event: 'awaiting_approval',
          data: JSON.stringify({ pending: calls.filter(t => t.status === 'awaiting_approval').map(t => t.id) }),
        })
        return
      }

      // All decided → resume the AI loop with the tool_results in hand.
      try {
        const pinnedLead = await loadPinnedLead(null)  // pinned-lead resume isn't preserved across approvals; fine for v1
        const systemPrompt = buildSystemPrompt(settings, pinnedLead)
        const history = await loadThreadHistory(body.thread_id!)
        await runChatLoop({ stream, threadId: body.thread_id!, uid, isAdmin, settings, systemPrompt, history })
      } catch (err) {
        await emitError(stream, body.thread_id!, err as Error)
      }
    })
  })
}

// ── Core loop ─────────────────────────────────────────────────────────
interface LoopArgs {
  stream: StreamSink
  threadId: string
  uid: string
  isAdmin: boolean
  settings: NomoSettings
  systemPrompt: string
  history: PersistedMessage[]
}

async function runChatLoop(args: LoopArgs) {
  const provider = args.settings.active_ai_provider
  if (provider === 'anthropic') return runAnthropicLoop(args)
  if (provider === 'openai' || provider === 'openrouter') return runOpenAICompatibleLoop({ ...args, provider })
  throw new Error(`provider "${provider}" not yet wired in Nomo. Use anthropic / openai / openrouter.`)
}

// ── Anthropic ────────────────────────────────────────────────────────
async function runAnthropicLoop({ stream, threadId, uid, isAdmin, settings, systemPrompt, history }: LoopArgs) {
  const apiKey = await getProviderKey('anthropic')
  if (!apiKey) throw new Error('Anthropic API key not configured')
  const model = settings.anthropic_model || 'claude-sonnet-4-20250514'

  const messages: AnthropicMessage[] = anthropicMessagesFromHistory(history)
  let totalTokensIn = 0, totalTokensOut = 0
  let finalText = ''
  const persistedToolCalls: ToolCallEntry[] = []

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1500, system: systemPrompt, messages, tools: anthropicToolSpec() }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`anthropic ${res.status}: ${txt.slice(0, 300)}`)
    }
    const json = await res.json() as { content: AnthropicBlock[]; stop_reason: string; usage?: { input_tokens?: number; output_tokens?: number } }
    totalTokensIn  += json.usage?.input_tokens  ?? 0
    totalTokensOut += json.usage?.output_tokens ?? 0

    for (const block of json.content) {
      if (block.type === 'text' && block.text) {
        finalText += block.text
        for (const piece of chunk(block.text, 24)) {
          await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: piece }) })
        }
      }
    }

    if (json.stop_reason !== 'tool_use') {
      await persistAssistantMessage(threadId, finalText, persistedToolCalls, model, totalTokensIn, totalTokensOut, 'done')
      await maybeAutoTitle(threadId, history)
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ tokens_in: totalTokensIn, tokens_out: totalTokensOut, model }) })
      return
    }

    messages.push({ role: 'assistant', content: json.content })
    const toolResults: AnthropicToolResultBlock[] = []
    let pausedForApproval = false

    for (const block of json.content) {
      if (block.type !== 'tool_use') continue
      const tu = block as AnthropicToolUseBlock
      const tool = findTool(tu.name)
      const entry: ToolCallEntry = { id: tu.id, name: tu.name, input: tu.input, status: 'done' }
      persistedToolCalls.push(entry)

      const gate = tool ? canRunWriteAutomatically(tool, settings.nomo_mode, settings.nomo_autopilot_tools, isAdmin) : { ok: false, reason: 'unknown_tool' as const }

      if (!gate.ok && tool?.write) {
        // Pause for approval.
        entry.status = 'awaiting_approval'
        await stream.writeSSE({
          event: 'tool_call',
          data: JSON.stringify({ id: tu.id, name: tu.name, input: tu.input, requires_approval: true, reason: gate.reason }),
        })
        pausedForApproval = true
      } else {
        await stream.writeSSE({ event: 'tool_call', data: JSON.stringify({ id: tu.id, name: tu.name, input: tu.input }) })
        if (!tool) {
          entry.status = 'failed'; entry.is_error = true; entry.result = `unknown tool: ${tu.name}`
        } else if (tool.admin_only && !isAdmin) {
          entry.status = 'failed'; entry.is_error = true; entry.result = 'admin only'
        } else {
          try {
            const out = await tool.run(tu.input)
            entry.result = JSON.stringify(out).slice(0, 100_000)
          } catch (err) {
            entry.status = 'failed'; entry.is_error = true; entry.result = (err as Error).message
          }
        }
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: entry.result ?? '', is_error: !!entry.is_error })
        await stream.writeSSE({
          event: 'tool_result',
          data: JSON.stringify({ tool_use_id: tu.id, content: entry.result, is_error: !!entry.is_error, status: entry.status }),
        })
      }
    }

    if (pausedForApproval) {
      // Persist the assistant message with awaiting_approval; the
      // /approve endpoint will resume.
      await persistAssistantMessage(threadId, finalText, persistedToolCalls, model, totalTokensIn, totalTokensOut, 'awaiting_approval')
      await maybeAutoTitle(threadId, history)
      await stream.writeSSE({
        event: 'awaiting_approval',
        data: JSON.stringify({
          message_id: await getLastAssistantMessageId(threadId),
          pending: persistedToolCalls.filter(t => t.status === 'awaiting_approval').map(t => ({ id: t.id, name: t.name, input: t.input })),
        }),
      })
      return
    }

    messages.push({ role: 'user', content: toolResults })
  }
  await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: `tool loop exceeded ${MAX_TOOL_ROUNDS} rounds` }) })
}

// ── OpenAI / OpenRouter ──────────────────────────────────────────────
interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

async function runOpenAICompatibleLoop(args: LoopArgs & { provider: 'openai' | 'openrouter' }) {
  const { stream, threadId, uid, isAdmin, settings, systemPrompt, history, provider } = args
  const apiKey = await getProviderKey(provider)
  if (!apiKey) throw new Error(`${provider} API key not configured`)
  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions'
  const model = provider === 'openai'
    ? (settings.openai_model || 'gpt-4o-mini')
    : (settings.openrouter_model || 'anthropic/claude-sonnet-4')

  const messages: OAIMessage[] = openaiMessagesFromHistory(systemPrompt, history)
  let totalTokensIn = 0, totalTokensOut = 0
  let finalText = ''
  const persistedToolCalls: ToolCallEntry[] = []

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://crm.imbaproduction.com', 'X-Title': 'imba.crm Nomo' } : {}),
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
      await persistAssistantMessage(threadId, finalText, persistedToolCalls, model, totalTokensIn, totalTokensOut, 'done')
      await maybeAutoTitle(threadId, history)
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ tokens_in: totalTokensIn, tokens_out: totalTokensOut, model }) })
      return
    }

    messages.push({ role: 'assistant', content: choice.message.content ?? null, tool_calls: choice.message.tool_calls })

    let pausedForApproval = false
    for (const call of choice.message.tool_calls) {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(call.function.arguments) } catch { /* tolerate */ }
      const tool = findTool(call.function.name)
      const entry: ToolCallEntry = { id: call.id, name: call.function.name, input, status: 'done' }
      persistedToolCalls.push(entry)
      const gate = tool ? canRunWriteAutomatically(tool, settings.nomo_mode, settings.nomo_autopilot_tools, isAdmin) : { ok: false, reason: 'unknown_tool' as const }
      if (!gate.ok && tool?.write) {
        entry.status = 'awaiting_approval'
        await stream.writeSSE({
          event: 'tool_call',
          data: JSON.stringify({ id: call.id, name: call.function.name, input, requires_approval: true, reason: gate.reason }),
        })
        pausedForApproval = true
      } else {
        await stream.writeSSE({ event: 'tool_call', data: JSON.stringify({ id: call.id, name: call.function.name, input }) })
        if (!tool) {
          entry.status = 'failed'; entry.is_error = true; entry.result = `unknown tool: ${call.function.name}`
        } else if (tool.admin_only && !isAdmin) {
          entry.status = 'failed'; entry.is_error = true; entry.result = 'admin only'
        } else {
          try { entry.result = JSON.stringify(await tool.run(input)).slice(0, 100_000) }
          catch (err) { entry.status = 'failed'; entry.is_error = true; entry.result = (err as Error).message }
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: entry.result ?? '' })
        await stream.writeSSE({
          event: 'tool_result',
          data: JSON.stringify({ tool_use_id: call.id, content: entry.result, is_error: !!entry.is_error, status: entry.status }),
        })
      }
    }

    if (pausedForApproval) {
      await persistAssistantMessage(threadId, finalText, persistedToolCalls, model, totalTokensIn, totalTokensOut, 'awaiting_approval')
      await maybeAutoTitle(threadId, history)
      await stream.writeSSE({
        event: 'awaiting_approval',
        data: JSON.stringify({
          message_id: await getLastAssistantMessageId(threadId),
          pending: persistedToolCalls.filter(t => t.status === 'awaiting_approval').map(t => ({ id: t.id, name: t.name, input: t.input })),
        }),
      })
      return
    }
  }
  await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: `tool loop exceeded ${MAX_TOOL_ROUNDS} rounds` }) })
  void uid // suppress unused
}

// ── Helpers ──────────────────────────────────────────────────────────
async function ensureThread(uid: string, threadId: string | null, leadId: string | null, userMessage: string): Promise<string | null> {
  if (threadId) {
    const { data: t } = await supabase.from('crm_nomo_threads').select('id, user_id').eq('id', threadId).maybeSingle()
    const row = t as { id: string; user_id: string | null } | null
    if (row && (!row.user_id || row.user_id === uid)) return row.id
  }
  const { data: created } = await supabase.from('crm_nomo_threads').insert({
    user_id: uid,
    title: userMessage.slice(0, 80),
    pinned_lead_id: leadId,
  }).select('id').maybeSingle()
  return (created as { id: string } | null)?.id ?? null
}

async function loadThreadHistory(threadId: string): Promise<PersistedMessage[]> {
  const { data } = await supabase
    .from('crm_nomo_messages')
    .select('id, role, content, tool_calls, status')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(80)
  return (data as PersistedMessage[] | null) ?? []
}

async function loadPinnedLead(leadId: string | null): Promise<Record<string, unknown> | null> {
  if (!leadId) return null
  const { data } = await supabase
    .from('crm_lead_360')
    .select('id, name, email, company, stage, fit_score, intent_score, engagement_score, deal_health, deal_health_reason, value, last_email_sent_at, total_replies')
    .eq('id', leadId)
    .maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
}

async function persistAssistantMessage(threadId: string, content: string, toolCalls: ToolCallEntry[], model: string, tokensIn: number, tokensOut: number, status: 'done' | 'awaiting_approval'): Promise<void> {
  await supabase.from('crm_nomo_messages').insert({
    thread_id: threadId,
    role: 'assistant',
    content,
    tool_calls: toolCalls,
    status,
    model,
    tokens_in:  tokensIn  || null,
    tokens_out: tokensOut || null,
  })
}

async function maybeAutoTitle(threadId: string, history: PersistedMessage[]): Promise<void> {
  if (history.filter(m => m.role === 'assistant').length > 0) return  // only first reply triggers
  const firstUser = history.find(m => m.role === 'user')?.content?.slice(0, 80) ?? null
  if (!firstUser) return
  await supabase.from('crm_nomo_threads').update({ title: firstUser }).eq('id', threadId).is('title', null)
}

async function getLastAssistantMessageId(threadId: string): Promise<string | null> {
  const { data } = await supabase
    .from('crm_nomo_messages')
    .select('id')
    .eq('thread_id', threadId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

async function emitError(stream: StreamSink, threadId: string, err: Error): Promise<void> {
  log('error', 'nomo failed', { error: err.message })
  await supabase.from('crm_nomo_messages').insert({
    thread_id: threadId, role: 'assistant',
    content: `_Nomo failed: ${err.message}_`,
    status: 'failed',
    error: err.message.slice(0, 500),
  })
  await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: err.message }) })
}

function chunk(s: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out
}

// Reconstruct the conversation as Anthropic messages from our flat
// nomo_messages history. Each persisted assistant row carries its
// tool_calls in JSON; we use those to rebuild the content blocks.
function anthropicMessagesFromHistory(history: PersistedMessage[]): AnthropicMessage[] {
  const messages: AnthropicMessage[] = []
  for (const m of history) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content ?? '' })
    } else if (m.role === 'assistant') {
      const blocks: AnthropicBlock[] = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      const calls = m.tool_calls ?? []
      // Add tool_use blocks for any call we made.
      for (const tc of calls) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
      }
      messages.push({ role: 'assistant', content: blocks.length > 0 ? blocks : (m.content ?? '') })
      // If any of those calls already have results, add them as a
      // user message so the next round can build on them. (Anthropic
      // requires the tool_results to come from role='user'.)
      const decided = calls.filter(c => c.status !== 'awaiting_approval')
      if (decided.length > 0) {
        const results: AnthropicToolResultBlock[] = decided.map(c => ({
          type: 'tool_result',
          tool_use_id: c.id,
          content: c.result ?? '',
          is_error: !!c.is_error,
        }))
        messages.push({ role: 'user', content: results })
      }
    }
    // 'tool' role rows are legacy; we now keep results inline in the
    // assistant message's tool_calls jsonb. Skip.
  }
  return messages
}

function openaiMessagesFromHistory(systemPrompt: string, history: PersistedMessage[]): OAIMessage[] {
  const messages: OAIMessage[] = [{ role: 'system', content: systemPrompt }]
  for (const m of history) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content ?? '' })
    } else if (m.role === 'assistant') {
      const calls = m.tool_calls ?? []
      const tool_calls = calls.map(c => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
      }))
      messages.push({
        role: 'assistant',
        content: m.content ?? null,
        ...(tool_calls.length > 0 ? { tool_calls } : {}),
      })
      for (const c of calls) {
        if (c.status === 'awaiting_approval') continue
        messages.push({ role: 'tool', tool_call_id: c.id, content: c.result ?? '' })
      }
    }
  }
  return messages
}

declare module 'hono' {
  interface ContextVariableMap {
    uid: string
    isAdmin: boolean
  }
}
