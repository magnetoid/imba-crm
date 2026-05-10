// Single source of truth for Nomo state. Both the slide-out panel and
// the full-page module use this hook — same threadId, same messages.
//
// Streaming: we use fetch + ReadableStream rather than EventSource so
// we can POST the message body and pass the auth header. Each chunk is
// an SSE-format line (data: ..., event: ..., \n\n).

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@imba/shared/supabase'

export interface NomoToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  result?: string                           // raw json string from the tool
  is_error?: boolean
  pending?: boolean                         // true while the tool is auto-running
  /** Set when the model called a write tool that needs human approval. */
  requires_approval?: boolean
  /** Final status from the persisted assistant message. */
  status?: 'done' | 'awaiting_approval' | 'approved' | 'rejected' | 'failed'
}

export interface NomoMessage {
  id?: string
  thread_id?: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  status?: 'streaming' | 'awaiting_approval' | 'approved' | 'rejected' | 'done' | 'failed'
  tool_calls?: NomoToolCall[]
  awaiting_approval?: boolean
  tokens_in?: number | null
  tokens_out?: number | null
  cost_cents?: number | null
  model?: string | null
  created_at?: string
}

export interface NomoThread {
  id: string
  title: string | null
  pinned_lead_id: string | null
  archived: boolean
  last_message_at: string
  created_at: string
}

const NOMO_BASE = '/api/nomo'

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token
    ? { 'content-type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'content-type': 'application/json' }
}

export function useNomo() {
  const [threads, setThreads]   = useState<NomoThread[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<NomoMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // ── List threads ────────────────────────────────────────────────────
  const refreshThreads = useCallback(async () => {
    try {
      const res = await fetch(`${NOMO_BASE}/threads`, { headers: await authHeaders() })
      if (!res.ok) return
      const json = await res.json() as { threads: NomoThread[] }
      setThreads(json.threads ?? [])
    } catch { /* network blip */ }
  }, [])

  useEffect(() => { void refreshThreads() }, [refreshThreads])

  // ── Open / load thread ──────────────────────────────────────────────
  const openThread = useCallback(async (id: string | null) => {
    setError(null)
    setThreadId(id)
    setMessages([])
    if (!id) return
    try {
      const res = await fetch(`${NOMO_BASE}/threads/${id}`, { headers: await authHeaders() })
      if (!res.ok) {
        setError(`Failed to load thread (${res.status})`)
        return
      }
      const json = await res.json() as {
        messages: Array<NomoMessage & {
          tool_calls?: Array<{ id: string; name: string; input: Record<string, unknown>; status?: string; result?: string; is_error?: boolean }>
          tool_results?: Array<{ tool_use_id: string; content: string; is_error?: boolean }>
        }>
      }
      const stitched: NomoMessage[] = (json.messages ?? []).map(m => {
        if (m.role !== 'assistant') return m as NomoMessage
        const calls: NomoToolCall[] = (m.tool_calls ?? []).map(c => ({
          id: c.id,
          name: c.name,
          input: c.input,
          result: c.result,
          is_error: !!c.is_error,
          pending: false,
          requires_approval: c.status === 'awaiting_approval',
          status: (c.status as NomoToolCall['status']) ?? undefined,
        }))
        // Legacy fallback: if persisted message used the separate
        // tool_results column, merge those in.
        const directResults = (m.tool_results ?? []) as Array<{ tool_use_id: string; content: string; is_error?: boolean }>
        for (const r of directResults) {
          const c = calls.find(x => x.id === r.tool_use_id)
          if (c && !c.result) { c.result = r.content; c.is_error = !!r.is_error }
        }
        const awaiting = calls.some(c => c.status === 'awaiting_approval')
        return {
          ...(m as NomoMessage),
          tool_calls: calls.length > 0 ? calls : undefined,
          awaiting_approval: awaiting,
        }
      })
      setMessages(stitched)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  const newThread = useCallback(() => {
    setThreadId(null)
    setMessages([])
    setError(null)
  }, [])

  // ── Shared SSE consumer ─────────────────────────────────────────────
  const consumeStream = useCallback(async (res: Response) => {
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => '')
      throw new Error(`stream failed (${res.status}): ${txt.slice(0, 200)}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const block of events) handleSseBlock(block)
    }
  }, [])

  function handleSseBlock(block: string) {
    const lines = block.split('\n')
    let event = 'message'
    let data = ''
    for (const line of lines) {
      if      (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:'))  data += line.slice(5).trim()
    }
    if (!data) return
    let json: Record<string, unknown>
    try { json = JSON.parse(data) } catch { return }

    if (event === 'thread' && typeof json.thread_id === 'string') {
      setThreadId(json.thread_id)
    } else if (event === 'delta' && typeof json.text === 'string') {
      setMessages(prev => withLastAssistant(prev, last => { last.content = (last.content ?? '') + json.text }))
    } else if (event === 'tool_call') {
      const requiresApproval = !!json.requires_approval
      setMessages(prev => withLastAssistant(prev, last => {
        last.tool_calls = [...(last.tool_calls ?? []), {
          id:    json.id    as string,
          name:  json.name  as string,
          input: (json.input ?? {}) as Record<string, unknown>,
          pending: !requiresApproval,
          requires_approval: requiresApproval,
          status: requiresApproval ? 'awaiting_approval' : undefined,
        }]
      }))
    } else if (event === 'tool_result') {
      setMessages(prev => withLastAssistant(prev, last => {
        const tc = last.tool_calls?.find(t => t.id === json.tool_use_id)
        if (!tc) return
        tc.result = String(json.content ?? '')
        tc.is_error = !!json.is_error
        tc.pending = false
        tc.requires_approval = false
        tc.status = (json.status as NomoToolCall['status']) ?? (json.is_error ? 'failed' : 'done')
      }))
    } else if (event === 'awaiting_approval') {
      setMessages(prev => withLastAssistant(prev, last => {
        last.awaiting_approval = true
        last.status = 'awaiting_approval'
        if (typeof json.message_id === 'string') last.id = json.message_id
      }))
    } else if (event === 'done') {
      setMessages(prev => withLastAssistant(prev, last => {
        last.status = 'done'
        last.awaiting_approval = false
        last.tokens_in  = json.tokens_in  as number | null
        last.tokens_out = json.tokens_out as number | null
        last.model      = json.model      as string | null
      }))
    } else if (event === 'error') {
      const msg = (json.message as string | undefined) ?? 'unknown error'
      setError(msg)
      setMessages(prev => withLastAssistant(prev, last => {
        last.status = 'failed'
        last.content = (last.content ?? '') + `\n\n_${msg}_`
      }))
    }
  }

  // ── Send a user message ─────────────────────────────────────────────
  const send = useCallback(async (text: string, opts?: { lead_id?: string }) => {
    if (!text.trim() || streaming) return
    setError(null)
    setStreaming(true)
    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', status: 'streaming' },
    ])
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch(`${NOMO_BASE}/chat`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ thread_id: threadId, message: text, lead_id: opts?.lead_id }),
        signal: controller.signal,
      })
      await consumeStream(res)
      void refreshThreads()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [threadId, streaming, refreshThreads, consumeStream])

  // ── Approve / reject a pending tool call ────────────────────────────
  const decide = useCallback(async (
    messageId: string,
    toolUseId: string,
    decision: 'approve' | 'reject',
    editedInput?: Record<string, unknown>,
  ) => {
    if (!threadId || streaming) return
    setError(null)
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch(`${NOMO_BASE}/approve`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          thread_id: threadId,
          message_id: messageId,
          tool_use_id: toolUseId,
          decision,
          edited_input: editedInput,
        }),
        signal: controller.signal,
      })
      await consumeStream(res)
      void refreshThreads()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [threadId, streaming, refreshThreads, consumeStream])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
  }, [])

  const archive = useCallback(async (id: string) => {
    await fetch(`${NOMO_BASE}/threads/${id}/archive`, { method: 'POST', headers: await authHeaders() })
    if (threadId === id) newThread()
    void refreshThreads()
  }, [threadId, newThread, refreshThreads])

  return {
    threads, threadId, messages, streaming, error,
    refreshThreads, openThread, newThread, send, decide, cancel, archive,
  }
}

// Apply a mutation to the last assistant message in the list. Pure-ish:
// returns a new array but the message object is mutated in-place. Fine
// for our streaming hot-path; the consumer re-renders on each set call.
function withLastAssistant(prev: NomoMessage[], mutate: (last: NomoMessage) => void): NomoMessage[] {
  const next = [...prev]
  const last = next[next.length - 1]
  if (last && last.role === 'assistant') mutate(last)
  return next
}
