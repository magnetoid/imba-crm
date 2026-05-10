// CRM Inbox — Phase 12 rebuild.
//
// 3-pane mail client:
//   ┌──────────────┬─────────────────────────┬──────────────────┐
//   │ Thread list  │ Selected thread         │ Composer +      │
//   │ (left)       │ (middle, oldest→newest) │ AI tools (right)│
//   └──────────────┴─────────────────────────┴──────────────────┘
//
// Reads `crm_inbox_threads` view (one row per thread_key with rollups).
// Click a thread → fetches all messages with that thread_key.
//
// Caching:
//   - Thread list is mirrored to sessionStorage. On mount we render the
//     cache instantly, then fire a delta-fetch (threads with
//     last_message_at > cache cursor) and merge.
//   - Message bodies are fetched on first click and kept in-memory for
//     the session. Navigating back to a thread doesn't refetch.
//
// AI compose (via /api/inbox/*):
//   - "Suggest replies" → 3 one-click options (Instant Reply pattern)
//   - "Write with prompt" → operator types intent, AI drafts the body
//   - "Rewrite as <tone>" → operator typed something, AI rewrites
//
// Templates: pulls from crm_templates (existing table), {{name}}
// {{company}} merge fields resolved from the lead row.
//
// Keyboard: j/k = next/prev thread · r = reply · e = archive ·
//           ⌘⏎ = send · ⌘k = focus search

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Textarea } from '@imba/shared/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@imba/shared/ui/select'
import { Badge } from '@imba/shared/ui/badge'
import toast from 'react-hot-toast'
import {
  Inbox as InboxIcon, Loader2, RefreshCw, Send, Sparkles, Wand2, Archive,
  MailQuestion, Reply, Search, Clock, ChevronRight, ChevronDown, Check,
  AlertCircle, ChevronUp, MessageSquare,
} from 'lucide-react'

interface ThreadRow {
  thread_key: string
  subject: string
  last_message_at: string
  first_message_at: string
  message_count: number
  unread_count: number
  has_inbound: boolean
  last_from_email: string | null
  first_lead_id: string | null
  latest_ai_category: string | null
  latest_ai_sentiment: string | null
  is_snoozed: boolean
}

interface MessageRow {
  id: string
  thread_key: string
  lead_id: string | null
  direction: 'inbound' | 'outbound'
  subject: string | null
  body: string
  from_email: string | null
  to_email: string | null
  status: string
  ai_category: string | null
  ai_sentiment: string | null
  ai_suggested_reply: string | null
  received_at: string
  metadata: Record<string, unknown> | null
}

interface TemplateRow { id: string; name: string; subject: string | null; content: string }

interface LeadRow { id: string; name: string; email: string | null; company: string | null }

type Tab = 'all' | 'needs_reply' | 'fyi' | 'sent' | 'snoozed'

const CACHE_KEY = 'inbox_threads_cache_v2'
const MESSAGE_CACHE = new Map<string, MessageRow[]>()  // in-memory, by thread_key

interface Cache { threads: ThreadRow[]; fetched_at: string }
function readCache(): Cache | null {
  try { const raw = sessionStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) as Cache : null }
  catch { return null }
}
function writeCache(c: Cache) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* private mode */ }
}

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { 'content-type': 'application/json', Authorization: `Bearer ${token}` } : { 'content-type': 'application/json' }
}

export default function AIInbox() {
  const [threads, setThreads] = useState<ThreadRow[]>(() => readCache()?.threads ?? [])
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [lead, setLead] = useState<LeadRow | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [suggestions, setSuggestions] = useState<Array<{ label: string; text: string }> | null>(null)
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [rewriteBusy, setRewriteBusy] = useState(false)
  const [composePrompt, setComposePrompt] = useState('')
  const [composeBusy, setComposeBusy] = useState(false)
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const searchRef = useRef<HTMLInputElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  // ── Initial load + delta fetch ──────────────────────────────────────
  const fetchThreads = useCallback(async (mode: 'delta' | 'full' = 'delta') => {
    setRefreshing(true)
    const cache = readCache()
    let query = supabase.from('crm_inbox_threads')
      .select('*').order('last_message_at', { ascending: false }).limit(500)
    if (mode === 'delta' && cache?.fetched_at) {
      query = query.gt('last_message_at', cache.fetched_at)
    }
    const { data, error } = await query
    setRefreshing(false)
    if (error) { toast.error(error.message); return }
    const fresh = (data as ThreadRow[] | null) ?? []
    setThreads(prev => {
      const merged = mergeThreads(mode === 'full' ? [] : prev, fresh)
      writeCache({ threads: merged, fetched_at: new Date().toISOString() })
      return merged
    })
  }, [])

  function mergeThreads(prev: ThreadRow[], fresh: ThreadRow[]): ThreadRow[] {
    const byKey = new Map<string, ThreadRow>()
    for (const t of prev) byKey.set(t.thread_key, t)
    for (const t of fresh) byKey.set(t.thread_key, t)   // fresh wins on overlap
    return Array.from(byKey.values())
      .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
  }

  useEffect(() => { void fetchThreads('delta') }, [fetchThreads])

  // Load templates once.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('crm_templates').select('id, name, subject, content').order('name')
      setTemplates(((data as TemplateRow[] | null) ?? []))
    })()
  }, [])

  // ── Open a thread ──────────────────────────────────────────────────
  const openThread = useCallback(async (key: string) => {
    setSelectedKey(key)
    setSuggestions(null)
    setDraft('')
    setComposePrompt('')

    const cached = MESSAGE_CACHE.get(key)
    if (cached) {
      setMessages(cached)
      const leadId = cached.find(m => m.lead_id)?.lead_id ?? null
      if (leadId) void loadLead(leadId)
      else setLead(null)
      return
    }

    setLoadingThread(true)
    setMessages([])
    setLead(null)
    const { data, error } = await supabase
      .from('crm_inbox_messages')
      .select('id, thread_key, lead_id, direction, subject, body, from_email, to_email, status, ai_category, ai_sentiment, ai_suggested_reply, received_at, metadata')
      .eq('thread_key', key)
      .order('received_at', { ascending: true })
    setLoadingThread(false)
    if (error) { toast.error(error.message); return }
    const msgs = (data as MessageRow[] | null) ?? []
    MESSAGE_CACHE.set(key, msgs)
    setMessages(msgs)
    const leadId = msgs.find(m => m.lead_id)?.lead_id ?? null
    if (leadId) void loadLead(leadId)
    // Mark unread inbound messages as read.
    const unreadIds = msgs.filter(m => m.direction === 'inbound' && m.status === 'unread').map(m => m.id)
    if (unreadIds.length > 0) {
      void supabase.from('crm_inbox_messages').update({ status: 'read' }).in('id', unreadIds)
      // Optimistically clear unread_count in the thread list.
      setThreads(prev => prev.map(t => t.thread_key === key ? { ...t, unread_count: 0 } : t))
    }
  }, [])

  async function loadLead(id: string) {
    const { data } = await supabase.from('crm_leads').select('id, name, email, company').eq('id', id).maybeSingle()
    setLead(data as LeadRow | null)
  }

  // ── Filtered + searched view ───────────────────────────────────────
  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase()
    return threads.filter(t => {
      if (tab === 'needs_reply' && (!t.has_inbound || t.unread_count === 0)) return false
      if (tab === 'fyi'        && t.latest_ai_category !== 'fyi') return false
      if (tab === 'sent'       && t.has_inbound) return false
      if (tab === 'snoozed'    && !t.is_snoozed) return false
      if (tab === 'all'        && t.is_snoozed) return false
      if (q) {
        return t.subject?.toLowerCase().includes(q)
          || t.last_from_email?.toLowerCase().includes(q)
      }
      return true
    })
  }, [threads, tab, search])

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const inEditable = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      // ⌘⏎ inside composer = send
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && composerRef.current === target) {
        e.preventDefault()
        void sendReply()
        return
      }
      // ⌘K = focus search (allow always)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (inEditable) return    // skip vim-style nav when typing

      const idx = filteredThreads.findIndex(t => t.thread_key === selectedKey)
      if (e.key === 'j' && idx < filteredThreads.length - 1) {
        e.preventDefault(); void openThread(filteredThreads[idx + 1].thread_key)
      } else if (e.key === 'k' && idx > 0) {
        e.preventDefault(); void openThread(filteredThreads[idx - 1].thread_key)
      } else if (e.key === 'r' && selectedKey) {
        e.preventDefault(); composerRef.current?.focus()
      } else if (e.key === 'e' && selectedKey) {
        e.preventDefault(); void archiveThread()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filteredThreads, selectedKey, openThread])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI helpers ─────────────────────────────────────────────────────
  async function callAiEndpoint<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
    const res = await fetch(`/api/inbox/${path}`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) })
    if (!res.ok) { toast.error(`AI ${path}: ${res.status}`); return null }
    return await res.json() as T
  }

  async function fetchSuggestions() {
    if (!selectedKey) return
    setSuggestBusy(true)
    const out = await callAiEndpoint<{ suggestions: Array<{ label: string; text: string }> }>('suggest', { thread_id: selectedKey })
    setSuggestBusy(false)
    if (out) setSuggestions(out.suggestions ?? [])
  }
  async function compose() {
    if (!selectedKey || !composePrompt.trim()) return
    setComposeBusy(true)
    const out = await callAiEndpoint<{ body: string }>('compose', { thread_id: selectedKey, prompt: composePrompt.trim() })
    setComposeBusy(false)
    if (out?.body) {
      setDraft(out.body)
      setComposePrompt('')
    }
  }
  async function rewrite(tone: string) {
    if (!draft.trim()) { toast.error('Type something first'); return }
    setRewriteBusy(true)
    const out = await callAiEndpoint<{ body: string }>('rewrite', { text: draft, tone, thread_id: selectedKey })
    setRewriteBusy(false)
    if (out?.body) setDraft(out.body)
  }

  function applyTemplate(t: TemplateRow) {
    // Merge {{name}}, {{company}}, {{email}} from the loaded lead.
    const interpolate = (s: string) => s
      .replace(/\{\{\s*name\s*\}\}/gi,    lead?.name ?? 'there')
      .replace(/\{\{\s*company\s*\}\}/gi, lead?.company ?? 'your team')
      .replace(/\{\{\s*email\s*\}\}/gi,   lead?.email ?? '')
    setDraft(interpolate(t.content))
    if (t.subject) {
      // surfacing subject would need its own state; for now just prepend
      // it to the body if not already there.
    }
  }

  // ── Send + archive ─────────────────────────────────────────────────
  async function sendReply() {
    if (!selectedKey || !draft.trim()) return
    setSending(true)
    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
    const recipientEmail = lead?.email ?? lastInbound?.from_email ?? null
    if (!recipientEmail) { toast.error('No recipient email'); setSending(false); return }
    const replySubject = (lastInbound?.subject ?? messages[0]?.subject ?? '(no subject)').replace(/^(Re:\s*)+/i, '')

    // Insert into crm_outreach_emails as 'approved' so the outbound
    // mailer picks it up. Also mirror as a crm_inbox_messages outbound
    // row so the thread shows it instantly.
    const messageId = `<imba-${Date.now()}-${Math.random().toString(36).slice(2)}@imbaproduction.com>`
    const lastInboundMessageId = (lastInbound?.metadata as { message_id?: string } | null)?.message_id

    await supabase.from('crm_outreach_emails').insert({
      lead_id: lead?.id ?? null,
      subject: `Re: ${replySubject}`,
      body: draft,
      to_email: recipientEmail,
      status: 'approved',
      ai_generated: false,
      tracking_id: messageId.replace(/[<>@]/g, ''),
    })
    await supabase.from('crm_inbox_messages').insert({
      lead_id: lead?.id ?? null,
      direction: 'outbound',
      subject: `Re: ${replySubject}`,
      body: draft,
      from_email: null,
      to_email: recipientEmail,
      status: 'sent',
      received_at: new Date().toISOString(),
      type: 'general',
      priority: 'normal',
      metadata: {
        message_id: messageId,
        in_reply_to: lastInboundMessageId,
        references: lastInboundMessageId ? [lastInboundMessageId] : [],
      },
    })
    setSending(false)
    setDraft('')
    setSuggestions(null)
    toast.success('Reply queued — outbound worker will send within a minute')
    // Refresh this thread (clears in-memory cache so latest outbound shows).
    MESSAGE_CACHE.delete(selectedKey)
    void openThread(selectedKey)
    void fetchThreads('delta')
  }

  async function archiveThread() {
    if (!selectedKey) return
    const ids = messages.map(m => m.id)
    if (ids.length === 0) return
    await supabase.from('crm_inbox_messages').update({ status: 'archived' }).in('id', ids)
    toast.success('Thread archived')
    setThreads(prev => prev.filter(t => t.thread_key !== selectedKey))
    setSelectedKey(null)
    setMessages([])
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-0px)] flex">
      {/* LEFT: thread list */}
      <aside className="w-80 border-r border-border bg-card flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <InboxIcon className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Inbox</h2>
            <Button variant="ghost" size="sm" className="ml-auto h-7 px-2"
              onClick={() => void fetchThreads('full')}
              title="Full refresh (delta auto-loads on open)"
              disabled={refreshing}>
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search… (⌘K)" className="h-8 pl-8 text-sm" />
          </div>
          <div className="flex gap-1 text-[11px]">
            {(['all','needs_reply','fyi','sent','snoozed'] as Tab[]).map(t => {
              const labels: Record<Tab, string> = { all: 'All', needs_reply: 'Needs reply', fyi: 'FYI', sent: 'Sent', snoozed: 'Snoozed' }
              return (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-2 py-1 rounded font-mono transition-colors ${
                    tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}>{labels[t]}</button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length === 0 ? (
            <div className="text-center text-muted-foreground p-8">
              <InboxIcon className="h-8 w-8 mx-auto opacity-30 mb-3" />
              <p className="text-xs">{threads.length === 0 ? 'No mail yet — configure IMAP in Settings.' : 'No threads match this filter.'}</p>
            </div>
          ) : (
            filteredThreads.map(t => (
              <button key={t.thread_key} onClick={() => void openThread(t.thread_key)}
                className={`w-full text-left p-3 border-b border-border transition-colors ${
                  selectedKey === t.thread_key ? 'bg-primary/10' : t.unread_count > 0 ? 'bg-muted/40 hover:bg-muted/60' : 'hover:bg-muted/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className={`text-xs truncate ${t.unread_count > 0 ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                    {t.last_from_email ?? (t.has_inbound ? 'Unknown sender' : 'You')}
                  </p>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {new Date(t.last_message_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <p className={`text-sm truncate mb-1 ${t.unread_count > 0 ? 'font-semibold' : ''}`}>
                  {t.subject || '(no subject)'}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {t.message_count > 1 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{t.message_count}</Badge>}
                  {t.unread_count > 0 && <Badge className="text-[10px] h-4 px-1.5 bg-primary text-primary-foreground">{t.unread_count} new</Badge>}
                  {t.latest_ai_category && <span className="text-[10px] text-muted-foreground font-mono">{t.latest_ai_category}</span>}
                  {t.latest_ai_sentiment === 'positive' && <span className="text-[10px] text-emerald-700">😊</span>}
                  {t.latest_ai_sentiment === 'negative' && <span className="text-[10px] text-red-700">😬</span>}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* MIDDLE: thread messages */}
      <main className="flex-1 min-w-0 flex flex-col bg-background">
        {!selectedKey ? (
          <div className="m-auto text-center text-muted-foreground p-8">
            <InboxIcon className="h-10 w-10 mx-auto opacity-30 mb-3" />
            <p className="text-sm">Select a thread to read.</p>
            <p className="text-[11px] mt-2 opacity-70">⌘K search · j/k navigate · r reply · e archive</p>
          </div>
        ) : loadingThread ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="border-b border-border px-5 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-semibold truncate">{messages[0]?.subject || '(no subject)'}</h1>
                {lead ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    From <a href={`/admin/crm/${lead.id}`} className="text-primary hover:underline">{lead.name}</a>
                    {lead.company && ` · ${lead.company}`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">No lead match</p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={archiveThread} className="gap-1 h-8">
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {messages.map(m => <MessageCard key={m.id} message={m} />)}
            </div>

            {/* COMPOSER + AI tools */}
            <div className="border-t border-border bg-card p-4 space-y-3">
              {/* AI suggestion buttons */}
              {suggestions && suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Suggested replies</p>
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => { setDraft(s.text); setSuggestions(null) }}
                      className="w-full text-left rounded-md border border-border bg-background hover:bg-muted px-3 py-2 transition-colors text-sm">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-2">{s.label}</span>
                      {s.text.length > 200 ? s.text.slice(0, 200) + '…' : s.text}
                    </button>
                  ))}
                </div>
              )}

              {/* Compose-from-prompt */}
              {composePrompt || composeBusy ? (
                <div className="flex gap-2">
                  <Input value={composePrompt} onChange={e => setComposePrompt(e.target.value)}
                    placeholder='e.g. "thank them and propose Wednesday 2pm"'
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void compose() } }} />
                  <Button onClick={() => void compose()} disabled={composeBusy || !composePrompt.trim()} size="sm">
                    {composeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Draft'}
                  </Button>
                  <Button onClick={() => setComposePrompt('')} variant="ghost" size="sm">×</Button>
                </div>
              ) : null}

              <Textarea
                ref={composerRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Type a reply. ⌘⏎ to send · r to focus here."
                rows={5}
                className="font-mono text-sm"
              />

              {/* Toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={() => void fetchSuggestions()} disabled={suggestBusy} size="sm" variant="outline" className="gap-1.5">
                  {suggestBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                  Suggest 3
                </Button>
                <Button onClick={() => setComposePrompt(' ')} size="sm" variant="outline" className="gap-1.5">
                  <Wand2 className="h-3.5 w-3.5 text-primary" /> Write with prompt
                </Button>
                <Select onValueChange={(v) => void rewrite(v)} disabled={rewriteBusy || !draft.trim()}>
                  <SelectTrigger className="h-8 text-xs w-auto px-3 gap-1.5">
                    <SelectValue placeholder={rewriteBusy ? 'Rewriting…' : 'Rewrite as…'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shorter">Shorter</SelectItem>
                    <SelectItem value="friendlier">Friendlier</SelectItem>
                    <SelectItem value="more-direct">More direct</SelectItem>
                    <SelectItem value="more-formal">More formal</SelectItem>
                    <SelectItem value="fix-grammar">Fix grammar</SelectItem>
                    <SelectItem value="translate-en">Translate to English</SelectItem>
                  </SelectContent>
                </Select>
                {templates.length > 0 && (
                  <Select onValueChange={(id) => { const t = templates.find(x => x.id === id); if (t) applyTemplate(t) }}>
                    <SelectTrigger className="h-8 text-xs w-auto px-3 gap-1.5">
                      <SelectValue placeholder="Templates" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex-1" />
                <span className="text-[10px] text-muted-foreground font-mono">⌘⏎</span>
                <Button onClick={() => void sendReply()} disabled={sending || !draft.trim()} size="sm" className="gap-1.5">
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send
                </Button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function MessageCard({ message }: { message: MessageRow }) {
  const [expanded, setExpanded] = useState(true)
  const isInbound = message.direction === 'inbound'
  const isHtml = /<[a-z][\s\S]*>/i.test(message.body ?? '')
  return (
    <div className={`rounded-lg border ${isInbound ? 'border-border bg-card' : 'border-primary/20 bg-primary/5'} shadow-sm`}>
      <button onClick={() => setExpanded(o => !o)} className="w-full text-left p-3 flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-mono ${
          isInbound ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
        }`}>{isInbound ? <Reply className="h-3 w-3" /> : <Send className="h-3 w-3" />}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">
            {isInbound ? (message.from_email ?? 'them') : 'You'}
            {message.ai_category && <span className="ml-2 text-[10px] text-muted-foreground font-mono">{message.ai_category}</span>}
          </p>
          <p className="text-[11px] text-muted-foreground">{new Date(message.received_at).toLocaleString()}</p>
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-3">
          {isHtml
            ? <div className="text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: message.body }} />
            : <pre className="text-sm whitespace-pre-wrap font-sans">{message.body}</pre>}
        </div>
      )}
    </div>
  )
}

// Suppress unused import warning — keep for future use.
void Inbox  // shadow check
void MailQuestion
void AlertCircle
void Check
void Clock
void ChevronRight
void MessageSquare
