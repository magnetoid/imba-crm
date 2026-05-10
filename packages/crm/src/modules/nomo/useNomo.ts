// Single source of truth for Nomo state. Both the slide-out panel and
// the full-page module use this hook — same threadId, same messages.
//
// Streaming: we use fetch + ReadableStream rather than EventSource so
// we can POST the message body and pass the auth header. Each chunk is
// an SSE-format line (data: ..., event: ..., \n\n).

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@imba/shared/supabase'

export interface NomoMessage {
  id?: string
  thread_id?: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  status?: 'streaming' | 'awaiting_approval' | 'approved' | 'rejected' | 'done' | 'failed'
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
      const json = await res.json() as { messages: NomoMessage[] }
      setMessages(json.messages ?? [])
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  const newThread = useCallback(() => {
    setThreadId(null)
    setMessages([])
    setError(null)
  }, [])

  // ── Send message + stream the reply ─────────────────────────────────
  const send = useCallback(async (text: string, opts?: { lead_id?: string }) => {
    if (!text.trim() || streaming) return
    setError(null)
    setStreaming(true)

    // Optimistic user message + placeholder assistant.
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
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '')
        throw new Error(`chat failed (${res.status}): ${txt.slice(0, 200)}`)
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
        for (const block of events) {
          const lines = block.split('\n')
          let event = 'message'
          let data = ''
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) data += line.slice(5).trim()
          }
          if (!data) continue
          try {
            const json = JSON.parse(data)
            if (event === 'thread' && json.thread_id) {
              setThreadId(json.thread_id)
            } else if (event === 'delta' && typeof json.text === 'string') {
              setMessages(prev => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last && last.role === 'assistant') {
                  last.content = (last.content ?? '') + json.text
                }
                return next
              })
            } else if (event === 'done') {
              setMessages(prev => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last && last.role === 'assistant') {
                  last.status = 'done'
                  last.tokens_in  = json.tokens_in
                  last.tokens_out = json.tokens_out
                  last.model      = json.model
                }
                return next
              })
            } else if (event === 'error') {
              setError(json.message ?? 'unknown error')
              setMessages(prev => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last && last.role === 'assistant') {
                  last.status = 'failed'
                  last.content = (last.content ?? '') + `\n\n_${json.message ?? 'failed'}_`
                }
                return next
              })
            }
          } catch { /* ignore non-json */ }
        }
      }
      void refreshThreads()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError((err as Error).message)
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [threadId, streaming, refreshThreads])

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
    refreshThreads, openThread, newThread, send, cancel, archive,
  }
}
