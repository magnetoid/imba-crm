// Shared chat surface used by both NomoPanel (slide-out) and Nomo (full-page
// module). Owns rendering of the message list and the composer; the parent
// passes the `useNomo()` return value in. Keeping it a pure component means
// there's exactly one chat UI to style/maintain.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Send, StopCircle, AlertCircle } from 'lucide-react'
import { Button } from '@imba/shared/ui/button'
import { Textarea } from '@imba/shared/ui/textarea'
import type { NomoMessage } from './useNomo'

interface Props {
  messages: NomoMessage[]
  streaming: boolean
  error: string | null
  onSend: (text: string) => void
  onCancel: () => void
  /** Compact mode renders smaller padding for use in the side panel. */
  compact?: boolean
  /** Optional context line shown above the composer (e.g. "Pinned to: Acme Inc"). */
  pinnedLabel?: string
}

export function NomoChat({ messages, streaming, error, onSend, onCancel, compact, pinnedLabel }: Props) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || streaming) return
    onSend(text)
    setDraft('')
  }

  const empty = messages.length === 0

  return (
    <div className={`flex flex-col h-full bg-background ${compact ? '' : ''}`}>
      <div ref={listRef} className={`flex-1 overflow-y-auto ${compact ? 'p-3' : 'p-6'} space-y-3`}>
        {empty && (
          <div className="text-center text-muted-foreground py-12">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-3">
              <span className="text-primary font-display text-lg">N</span>
            </div>
            <p className="text-sm">Hi, I'm Nomo. Ask me anything about your pipeline.</p>
            <p className="text-xs mt-2 opacity-70">
              Try: <em>"who's most likely to close this week?"</em>
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble key={m.id ?? i} message={m} />
        ))}

        {streaming && messages[messages.length - 1]?.status !== 'streaming' && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Nomo is thinking…
          </div>
        )}

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>

      <form onSubmit={submit} className={`border-t border-border ${compact ? 'p-3' : 'p-4'} bg-card`}>
        {pinnedLabel && (
          <p className="text-[11px] text-muted-foreground mb-1.5">{pinnedLabel}</p>
        )}
        <div className="flex gap-2 items-end">
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Ask Nomo to draft, score, search…"
            rows={compact ? 2 : 3}
            className="resize-none text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            disabled={streaming}
          />
          {streaming ? (
            <Button type="button" variant="outline" size="sm" onClick={onCancel} className="gap-1.5 flex-shrink-0">
              <StopCircle className="h-3.5 w-3.5" /> Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!draft.trim()} className="gap-1.5 flex-shrink-0">
              <Send className="h-3.5 w-3.5" /> Send
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          ⏎ to send, ⇧⏎ for new line. Tool calls (drafting, scoring) ship in 8.2.
        </p>
      </form>
    </div>
  )
}

function Bubble({ message }: { message: NomoMessage }) {
  const isUser = message.role === 'user'
  const isFailed = message.status === 'failed'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
        isUser
          ? 'bg-primary text-primary-foreground'
          : isFailed
            ? 'bg-red-50 text-red-900 border border-red-200'
            : 'bg-muted text-foreground border border-border'
      }`}>
        {message.content || (message.status === 'streaming' && <span className="text-muted-foreground italic">…</span>)}
        {!isUser && message.tokens_out != null && (
          <div className="mt-1 text-[10px] font-mono opacity-60">
            {message.model} · {message.tokens_in ?? '?'}/{message.tokens_out ?? '?'} tok
            {message.cost_cents != null ? ` · ${(message.cost_cents / 100).toFixed(4)}` : ''}
          </div>
        )}
      </div>
    </div>
  )
}
