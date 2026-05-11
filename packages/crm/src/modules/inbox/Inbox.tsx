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
import { Label } from '@imba/shared/ui/label'
import { Textarea } from '@imba/shared/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@imba/shared/ui/select'
import { Badge } from '@imba/shared/ui/badge'
import toast from 'react-hot-toast'
import {
  Inbox as InboxIcon, Loader2, RefreshCw, Send, Sparkles, Wand2, Archive,
  MailQuestion, Reply, Search, Clock, ChevronRight, ChevronDown, Check,
  AlertCircle, ChevronUp, MessageSquare, Paperclip, Download, X,
} from 'lucide-react'

interface ThreadRow {
  thread_key: string
  subject: string
  last_message_at: string
  first_message_at: string
  message_count: number
  unread_count: number
  has_inbound: boolean
  last_direction: 'inbound' | 'outbound' | null
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
  cc:  string[] | null
  bcc: string[] | null
  status: string
  ai_category: string | null
  ai_sentiment: string | null
  ai_suggested_reply: string | null
  received_at: string
  metadata: Record<string, unknown> | null
}

interface TemplateRow { id: string; name: string; subject: string | null; content: string }

interface LeadRow { id: string; name: string; email: string | null; company: string | null }

type Tab = 'all' | 'needs_reply' | 'fyi' | 'sent' | 'snoozed' | 'drafts'

const CACHE_KEY = 'inbox_threads_cache_v2'
const DRAFT_KEY_PREFIX = 'inbox_draft_v1_'   // localStorage per thread_key (or __new)

interface PersistedDraft {
  body: string
  subject: string
  to: string
  cc: string
  bcc: string
  showCc: boolean
  showBcc: boolean
  updated_at: string
}
function loadDraft(key: string): PersistedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + key)
    return raw ? JSON.parse(raw) as PersistedDraft : null
  } catch { return null }
}
function saveDraft(key: string, d: Omit<PersistedDraft, 'updated_at'>) {
  try {
    // Empty draft → delete the key (so empty composers don't leave litter).
    if (!d.body && !d.subject && !d.cc && !d.bcc && !d.to) {
      localStorage.removeItem(DRAFT_KEY_PREFIX + key)
      return
    }
    localStorage.setItem(DRAFT_KEY_PREFIX + key, JSON.stringify({ ...d, updated_at: new Date().toISOString() }))
  } catch { /* private mode */ }
}
function deleteDraft(key: string) {
  try { localStorage.removeItem(DRAFT_KEY_PREFIX + key) } catch { /* */ }
}
function listDrafts(): Array<{ key: string; draft: PersistedDraft }> {
  const out: Array<{ key: string; draft: PersistedDraft }> = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(DRAFT_KEY_PREFIX)) continue
      const raw = localStorage.getItem(k)
      if (!raw) continue
      try {
        out.push({ key: k.slice(DRAFT_KEY_PREFIX.length), draft: JSON.parse(raw) as PersistedDraft })
      } catch { /* ignore */ }
    }
  } catch { /* */ }
  return out.sort((a, b) => (b.draft.updated_at || '').localeCompare(a.draft.updated_at || ''))
}
const MESSAGE_CACHE_MAX = 50           // LRU size cap (~50 threads × ~50 msgs)
const MESSAGE_CACHE = new Map<string, MessageRow[]>()  // in-memory, by thread_key
// JS Maps preserve insertion order — re-set on access to move to "newest",
// and we evict the oldest (first) entry when the size cap is hit.
function lruGet(key: string): MessageRow[] | undefined {
  const v = MESSAGE_CACHE.get(key)
  if (!v) return undefined
  MESSAGE_CACHE.delete(key); MESSAGE_CACHE.set(key, v)
  return v
}
function lruSet(key: string, v: MessageRow[]) {
  if (MESSAGE_CACHE.has(key)) MESSAGE_CACHE.delete(key)
  MESSAGE_CACHE.set(key, v)
  if (MESSAGE_CACHE.size > MESSAGE_CACHE_MAX) {
    const oldest = MESSAGE_CACHE.keys().next().value
    if (oldest) MESSAGE_CACHE.delete(oldest)
  }
}

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
  const [draftCc,  setDraftCc]  = useState('')
  const [draftBcc, setDraftBcc] = useState('')
  const [showCc,   setShowCc]   = useState(false)
  const [showBcc,  setShowBcc]  = useState(false)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftTo,  setDraftTo]  = useState('')
  const [composeNewOpen, setComposeNewOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [draftsList, setDraftsList] = useState<Array<{ key: string; draft: PersistedDraft }>>(() => listDrafts())
  const [suggestions, setSuggestions] = useState<Array<{ label: string; text: string }> | null>(null)
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [rewriteBusy, setRewriteBusy] = useState(false)
  const [composePrompt, setComposePrompt] = useState('')
  const [composeBusy, setComposeBusy] = useState(false)
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [smtpFromEmail, setSmtpFromEmail] = useState<string | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ path: string; filename: string; size_bytes: number }>>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const attachFileRef = useRef<HTMLInputElement | null>(null)

  // ── Initial load + delta fetch ──────────────────────────────────────
  // Cursor = max(last_message_at) of all merged threads, NOT wall-clock.
  // Wall-clock would silently drop late-arriving messages whose
  // received_at is older than the previous fetch's timestamp (clock skew,
  // delayed IMAP backfill, slow DB inserts).
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
      // Cursor = newest message timestamp from the merged set. Falls back
      // to the previous cursor if we have no threads at all.
      const newestTs = merged.reduce<string>((acc, t) => {
        const ts = t.last_message_at
        return !acc || ts > acc ? ts : acc
      }, '')
      writeCache({
        threads: merged,
        fetched_at: newestTs || cache?.fetched_at || new Date(0).toISOString(),
      })
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

  // Autosave drafts to localStorage on every composer-field change.
  // Keyed by thread_key (replies) or '__new' (compose-new). Debounced by
  // React's render cycle — useEffect fires after state settles.
  useEffect(() => {
    if (!selectedKey && !composeNewOpen) return
    const key = composeNewOpen ? '__new' : (selectedKey ?? '')
    if (!key) return
    saveDraft(key, {
      body: draft,
      subject: draftSubject,
      to: draftTo,
      cc: draftCc,
      bcc: draftBcc,
      showCc, showBcc,
    })
    // Re-list drafts so the badge updates.
    setDraftsList(listDrafts())
  }, [draft, draftSubject, draftTo, draftCc, draftBcc, showCc, showBcc, selectedKey, composeNewOpen])

  // Load templates + outbound from-address once. smtp_from_email is what
  // we stamp onto outbound mirror rows so the "from" attribution is
  // accurate in the thread view.
  useEffect(() => {
    void (async () => {
      const [{ data: tpl }, { data: rt }] = await Promise.all([
        supabase.from('crm_templates').select('id, name, subject, content').order('name'),
        supabase.from('crm_runtime_settings').select('smtp_from_email').eq('id', 1).maybeSingle(),
      ])
      setTemplates(((tpl as TemplateRow[] | null) ?? []))
      setSmtpFromEmail(((rt as { smtp_from_email?: string | null } | null)?.smtp_from_email) ?? null)
    })()
  }, [])

  // Track the most-recently-requested thread so an in-flight fetch can
  // detect it has been superseded (user clicked thread B before A's
  // fetch resolved → A's response must NOT overwrite B's messages).
  const activeFetchRef = useRef<string | null>(null)

  // ── Open a thread ──────────────────────────────────────────────────
  const openThread = useCallback(async (key: string) => {
    setSelectedKey(key)
    activeFetchRef.current = key
    setSuggestions(null)
    setComposePrompt('')
    // Restore persisted draft for this thread (if any) so a half-written
    // reply survives reloads and tab switches.
    const persisted = loadDraft(key)
    setDraft(persisted?.body ?? '')
    setDraftSubject(persisted?.subject ?? '')
    setDraftTo(persisted?.to ?? '')
    setDraftCc(persisted?.cc ?? '')
    setDraftBcc(persisted?.bcc ?? '')
    setShowCc(persisted?.showCc ?? false)
    setShowBcc(persisted?.showBcc ?? false)

    const cached = lruGet(key)
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
      .select('id, thread_key, lead_id, direction, subject, body, from_email, to_email, cc, bcc, status, ai_category, ai_sentiment, ai_suggested_reply, received_at, metadata')
      .eq('thread_key', key)
      .order('received_at', { ascending: true })
    // Race-guard: if the user has clicked another thread while this one
    // was loading, discard this response.
    if (activeFetchRef.current !== key) return
    setLoadingThread(false)
    if (error) { toast.error(error.message); return }
    const msgs = (data as MessageRow[] | null) ?? []
    lruSet(key, msgs)
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

  async function handleAttachFile(file: File) {
    if (file.size > 25 * 1024 * 1024) { toast.error('25 MB cap on attachments'); return }
    setUploadingAttachment(true)
    const safeName = file.name.replace(/[^\w.\-]/g, '_').slice(0, 200)
    const path = `outbound/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`
    const { error } = await supabase.storage.from('inbox-attachments').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    setUploadingAttachment(false)
    if (error) { toast.error(error.message); return }
    setPendingAttachments(p => [...p, { path, filename: safeName, size_bytes: file.size }])
  }
  function removeAttachment(path: string) {
    setPendingAttachments(p => p.filter(a => a.path !== path))
  }

  async function loadLead(id: string) {
    const { data } = await supabase.from('crm_leads').select('id, name, email, company').eq('id', id).maybeSingle()
    setLead(data as LeadRow | null)
  }

  // ── Filtered + searched view ───────────────────────────────────────
  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase()
    return threads.filter(t => {
      // "Needs reply" = the latest message in the thread is inbound and
      // we haven't followed up yet. Read-but-unanswered threads still
      // belong here — that's the exact case where the operator needs the
      // nudge most.
      if (tab === 'needs_reply' && t.last_direction !== 'inbound') return false
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
      } else if (e.key === 'r' && !e.shiftKey && selectedKey) {
        e.preventDefault(); startReply()
      } else if (e.key === 'R' && e.shiftKey && selectedKey) {
        e.preventDefault(); startReplyAll()
      } else if (e.key === 'f' && selectedKey) {
        e.preventDefault(); startForward()
      } else if (e.key === 'e' && selectedKey) {
        e.preventDefault(); void archiveThread()
      } else if (e.key === 'c' && !composeNewOpen) {
        e.preventDefault(); openComposeNew()
      } else if (e.key === 'Escape' && composeNewOpen) {
        e.preventDefault(); closeComposeNew()
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

  // Parse the comma/semicolon-separated CC/BCC composer state into an
  // array of email addresses. Drops empties + duplicates + non-emails.
  function parseAddressList(raw: string): string[] {
    if (!raw.trim()) return []
    const seen = new Set<string>()
    for (const piece of raw.split(/[,;\n]/)) {
      const trimmed = piece.trim().toLowerCase()
      if (!trimmed) continue
      // Allow "Name <foo@bar.com>" — extract the bare address.
      const m = trimmed.match(/<([^>]+)>/)
      const addr = (m ? m[1] : trimmed).trim()
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) seen.add(addr)
    }
    return Array.from(seen)
  }

  // ── Compose new message (fresh thread) ─────────────────────────────
  function openComposeNew() {
    setSelectedKey(null)
    setMessages([])
    setLead(null)
    setComposeNewOpen(true)
    // Restore any persisted new-message draft.
    const persisted = loadDraft('__new')
    setDraft(persisted?.body ?? '')
    setDraftTo(persisted?.to ?? '')
    setDraftCc(persisted?.cc ?? '')
    setDraftBcc(persisted?.bcc ?? '')
    setShowCc(persisted?.showCc ?? false)
    setShowBcc(persisted?.showBcc ?? false)
    setDraftSubject(persisted?.subject ?? '')
    setPendingAttachments([])
    // Defer focus until the input mounts.
    setTimeout(() => { (document.querySelector('input[data-compose-to]') as HTMLInputElement | null)?.focus() }, 50)
  }
  function closeComposeNew() {
    setComposeNewOpen(false)
    setDraft('')
    setDraftTo(''); setDraftCc(''); setDraftBcc('')
    setShowCc(false); setShowBcc(false)
    setDraftSubject('')
    setPendingAttachments([])
  }
  async function sendNew() {
    const to = draftTo.trim().toLowerCase()
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast.error('Enter a valid recipient'); return }
    if (!draft.trim()) { toast.error('Body is empty'); return }
    setSending(true)
    // Look up an existing lead by email so the outbound message attaches
    // to their conversation history. If no lead exists, the outreach
    // row stays unlinked (operator can manually link later).
    const { data: existingLead } = await supabase
      .from('crm_leads').select('id').eq('email', to).maybeSingle()
    const leadId = (existingLead as { id: string } | null)?.id ?? null
    const ccList  = parseAddressList(draftCc)
    const bccList = parseAddressList(draftBcc)
    const trackingId = `imba-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const finalSubject = draftSubject.trim() || '(no subject)'
    await supabase.from('crm_outreach_emails').insert({
      lead_id: leadId,
      subject: finalSubject,
      body: draft,
      to_email: to,
      cc:  ccList.length  > 0 ? ccList  : null,
      bcc: bccList.length > 0 ? bccList : null,
      status: 'approved',
      ai_generated: false,
      tracking_id: trackingId,
      attachment_storage_paths: pendingAttachments.length > 0 ? pendingAttachments.map(a => a.path) : null,
    })
    await supabase.from('crm_inbox_messages').insert({
      lead_id: leadId,
      direction: 'outbound',
      subject: finalSubject,
      body: draft,
      from_email: smtpFromEmail,
      to_email: to,
      cc:  ccList.length  > 0 ? ccList  : null,
      bcc: bccList.length > 0 ? bccList : null,
      status: 'sent',
      received_at: new Date().toISOString(),
      type: 'general',
      priority: 'normal',
      metadata: {
        attachments: pendingAttachments.map(a => ({
          filename: a.filename, size_bytes: a.size_bytes,
          mime: 'application/octet-stream', storage_path: a.path,
        })),
      },
    })
    setSending(false)
    deleteDraft('__new')
    setDraftsList(listDrafts())
    toast.success('New message queued')
    closeComposeNew()
    void fetchThreads('delta')
  }

  // ── Reply / Reply-All / Forward pre-fill ───────────────────────────
  // Each prepares the composer fields based on the latest inbound and
  // (for Forward) the entire thread context. None of them send — they
  // just stage the draft for the operator to review.
  function startReply() {
    composerRef.current?.focus()
  }
  function startReplyAll() {
    const last = [...messages].reverse().find(m => m.direction === 'inbound')
    if (!last) { composerRef.current?.focus(); return }
    const mySelf = (smtpFromEmail ?? '').toLowerCase()
    const dedupe = new Set<string>()
    const isMine = (a: string) => !!mySelf && a.toLowerCase() === mySelf
    // CC = original CC + original To (except us + the original sender).
    const ccCandidates: string[] = []
    for (const a of last.cc ?? []) ccCandidates.push(a)
    if (last.to_email) ccCandidates.push(last.to_email)
    const ccs: string[] = []
    for (const a of ccCandidates) {
      const lower = a.toLowerCase()
      if (isMine(lower) || lower === (last.from_email ?? '').toLowerCase()) continue
      if (dedupe.has(lower)) continue
      dedupe.add(lower)
      ccs.push(a)
    }
    setShowCc(ccs.length > 0)
    setDraftCc(ccs.join(', '))
    composerRef.current?.focus()
  }
  function startForward() {
    const all = messages
      .map(m => {
        const who = m.direction === 'inbound' ? (m.from_email ?? 'them') : (m.from_email ?? 'me')
        const when = new Date(m.received_at).toLocaleString()
        const body = (m.body ?? '').slice(0, 5000)
        return `--- Forwarded ---\nFrom: ${who}\nDate: ${when}\nSubject: ${m.subject ?? '(no subject)'}\n\n${body}`
      })
      .join('\n\n')
    const last = [...messages].reverse().find(m => m.direction === 'inbound')
    setDraft(all)
    setDraftSubject(`Fwd: ${(last?.subject ?? messages[0]?.subject ?? '').replace(/^(Re:|Fwd:|Fw:)\s*/i, '').trim() || '(no subject)'}`)
    setDraftTo('')   // operator must pick a recipient
    setShowCc(false); setShowBcc(false); setDraftCc(''); setDraftBcc('')
    composerRef.current?.focus()
    toast('Enter the recipient in the To: field', { icon: '➡️' })
  }

  // ── Send + archive ─────────────────────────────────────────────────
  async function sendReply() {
    if (!selectedKey || !draft.trim()) return
    setSending(true)
    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
    // Allow operator-typed TO to override the default lead/lastInbound address.
    const recipientEmail = draftTo.trim() || lead?.email || lastInbound?.from_email || null
    if (!recipientEmail) { toast.error('No recipient email'); setSending(false); return }
    // Editable subject. Default to "Re: <last subject>"; if operator typed a
    // different subject keep theirs.
    const inferredSubject = `Re: ${(lastInbound?.subject ?? messages[0]?.subject ?? '(no subject)').replace(/^(Re:\s*)+/i, '')}`
    const finalSubject = draftSubject.trim() || inferredSubject
    const ccList  = parseAddressList(draftCc)
    const bccList = parseAddressList(draftBcc)

    // Insert into crm_outreach_emails as 'approved' so the outbound
    // mailer picks it up. Also mirror as a crm_inbox_messages outbound
    // row so the thread shows it instantly.
    //
    // The actual Message-ID gets generated by send-email.ts at send time
    // and stamped back onto both rows. We collect threading parents here
    // — every Message-ID we've seen in this thread becomes a References
    // entry, and the latest inbound becomes In-Reply-To. (RFC 5322 §3.6.4.)
    const trackingId = `imba-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const lastInboundMessageId = (lastInbound?.metadata as { message_id?: string } | null)?.message_id ?? null
    const referencesSet = new Set<string>()
    for (const m of messages) {
      const mid = (m.metadata as { message_id?: string; references?: string[] } | null)
      if (mid?.message_id) referencesSet.add(mid.message_id)
      if (Array.isArray(mid?.references)) for (const r of mid.references) if (r) referencesSet.add(r)
    }
    const references = Array.from(referencesSet)

    await supabase.from('crm_outreach_emails').insert({
      lead_id: lead?.id ?? null,
      subject: finalSubject,
      body: draft,
      to_email: recipientEmail,
      cc:  ccList.length  > 0 ? ccList  : null,
      bcc: bccList.length > 0 ? bccList : null,
      status: 'approved',
      ai_generated: false,
      tracking_id: trackingId,
      in_reply_to: lastInboundMessageId,
      email_references: references,
      attachment_storage_paths: pendingAttachments.length > 0 ? pendingAttachments.map(a => a.path) : null,
    })
    await supabase.from('crm_inbox_messages').insert({
      lead_id: lead?.id ?? null,
      direction: 'outbound',
      subject: finalSubject,
      body: draft,
      from_email: smtpFromEmail,              // best-effort; send-email.ts may refine
      to_email: recipientEmail,
      cc:  ccList.length  > 0 ? ccList  : null,
      bcc: bccList.length > 0 ? bccList : null,
      status: 'sent',
      received_at: new Date().toISOString(),
      type: 'general',
      priority: 'normal',
      metadata: {
        // message_id is intentionally null here; send-email.ts stamps it
        // once the SMTP send succeeds. Until then, the thread_key trigger
        // uses the in_reply_to to attach to the parent's thread.
        in_reply_to: lastInboundMessageId,
        references,
        attachments: pendingAttachments.map(a => ({
          filename: a.filename,
          size_bytes: a.size_bytes,
          mime: 'application/octet-stream',
          storage_path: a.path,
        })),
      },
    })
    setSending(false)
    setDraft('')
    setDraftSubject('')
    setDraftTo('')
    setDraftCc('')
    setDraftBcc('')
    setShowCc(false)
    setShowBcc(false)
    setSuggestions(null)
    setPendingAttachments([])
    if (selectedKey) deleteDraft(selectedKey)
    setDraftsList(listDrafts())
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
            <Button
              variant="default" size="sm"
              className="ml-auto h-7 px-2 gap-1"
              onClick={openComposeNew}
              title="Compose new message (c)"
            >
              <Send className="h-3.5 w-3.5" /> Compose
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2"
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
          <div className="flex gap-1 text-[11px] flex-wrap">
            {(['all','needs_reply','fyi','sent','snoozed','drafts'] as Tab[]).map(t => {
              const labels: Record<Tab, string> = {
                all: 'All', needs_reply: 'Needs reply', fyi: 'FYI', sent: 'Sent',
                snoozed: 'Snoozed', drafts: `Drafts${draftsList.length ? ` (${draftsList.length})` : ''}`,
              }
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
          {tab === 'drafts' ? (
            // Drafts list — auto-saved local drafts keyed by thread_key
            // (or '__new' for compose-new). Click → resume the draft in
            // the appropriate compose flow.
            draftsList.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">
                <InboxIcon className="h-8 w-8 mx-auto opacity-30 mb-3" />
                <p className="text-xs">No drafts. Anything you start typing is auto-saved here.</p>
              </div>
            ) : (
              draftsList.map(({ key, draft: d }) => (
                <div key={key} className="w-full text-left p-3 border-b border-border hover:bg-muted/30 group">
                  <button
                    onClick={() => key === '__new' ? openComposeNew() : void openThread(key)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs font-medium truncate">
                        {key === '__new' ? '(new message)' : `↩ ${key.slice(0, 30)}`}
                      </p>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {new Date(d.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {d.subject || d.body?.slice(0, 80) || '(empty)'}
                    </p>
                    {d.to && <p className="text-[10px] text-muted-foreground/70 truncate">To: {d.to}</p>}
                  </button>
                  <button
                    onClick={() => { deleteDraft(key); setDraftsList(listDrafts()) }}
                    className="text-[10px] text-muted-foreground hover:text-red-600 mt-1 opacity-0 group-hover:opacity-100"
                  >
                    Discard
                  </button>
                </div>
              ))
            )
          ) : filteredThreads.length === 0 ? (
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

      {/* MIDDLE: thread messages OR new-compose pane */}
      <main className="flex-1 min-w-0 flex flex-col bg-background">
        {composeNewOpen ? (
          <>
            <div className="border-b border-border px-5 py-3 flex items-center gap-3">
              <h1 className="text-base font-semibold">New message</h1>
              <Button variant="ghost" size="sm" onClick={closeComposeNew} className="ml-auto gap-1 h-8" title="Close (Esc)">
                <X className="h-3.5 w-3.5" /> Close
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div className="space-y-1.5 border border-border rounded-md p-2 bg-muted/20">
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-mono uppercase text-muted-foreground w-8">To</Label>
                  <Input
                    data-compose-to
                    value={draftTo}
                    onChange={e => setDraftTo(e.target.value)}
                    placeholder="someone@example.com"
                    className="h-7 text-xs flex-1"
                  />
                  <div className="flex items-center gap-1 text-[10px]">
                    {!showCc && <button type="button" onClick={() => setShowCc(true)} className="text-muted-foreground hover:text-foreground underline">Cc</button>}
                    {!showBcc && <button type="button" onClick={() => setShowBcc(true)} className="text-muted-foreground hover:text-foreground underline">Bcc</button>}
                  </div>
                </div>
                {showCc && (
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] font-mono uppercase text-muted-foreground w-8">Cc</Label>
                    <Input value={draftCc} onChange={e => setDraftCc(e.target.value)} placeholder="comma-separated" className="h-7 text-xs flex-1" />
                    <button type="button" onClick={() => { setShowCc(false); setDraftCc('') }} className="text-muted-foreground hover:text-red-600"><X className="h-3 w-3" /></button>
                  </div>
                )}
                {showBcc && (
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] font-mono uppercase text-muted-foreground w-8">Bcc</Label>
                    <Input value={draftBcc} onChange={e => setDraftBcc(e.target.value)} placeholder="hidden recipients" className="h-7 text-xs flex-1" />
                    <button type="button" onClick={() => { setShowBcc(false); setDraftBcc('') }} className="text-muted-foreground hover:text-red-600"><X className="h-3 w-3" /></button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-mono uppercase text-muted-foreground w-8">Subj</Label>
                  <Input value={draftSubject} onChange={e => setDraftSubject(e.target.value)} placeholder="(subject)" className="h-7 text-xs flex-1" />
                </div>
              </div>
              <Textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Type the message. ⌘⏎ to send · Esc to close."
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void sendNew() } }}
                rows={14}
                className="font-mono text-sm"
              />
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingAttachments.map(a => (
                    <span key={a.path} className="inline-flex items-center gap-1.5 px-2 py-1 border border-border rounded-md bg-muted/40 text-xs">
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono truncate max-w-[200px]">{a.filename}</span>
                      <span className="text-[10px] text-muted-foreground">{formatBytes(a.size_bytes)}</span>
                      <button type="button" onClick={() => removeAttachment(a.path)} className="text-muted-foreground hover:text-red-600"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <input
                ref={attachFileRef}
                type="file"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleAttachFile(f); e.target.value = '' }}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={() => attachFileRef.current?.click()} disabled={uploadingAttachment} size="sm" variant="outline" className="gap-1.5">
                  {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                  Attach
                </Button>
                <Button onClick={() => void sendNew()} disabled={sending || !draftTo.trim() || !draft.trim()} className="ml-auto gap-1.5">
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
                </Button>
              </div>
            </div>
          </>
        ) : !selectedKey ? (
          <div className="m-auto text-center text-muted-foreground p-8">
            <InboxIcon className="h-10 w-10 mx-auto opacity-30 mb-3" />
            <p className="text-sm">Select a thread to read.</p>
            <p className="text-[11px] mt-2 opacity-70">⌘K search · j/k navigate · c compose · r reply · Shift+R reply all · f forward · e archive</p>
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
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={startReply} className="gap-1 h-8" title="Reply (r)">
                  <Reply className="h-3.5 w-3.5" /> Reply
                </Button>
                <Button variant="ghost" size="sm" onClick={startReplyAll} className="gap-1 h-8" title="Reply to all recipients">
                  <Reply className="h-3.5 w-3.5 scale-x-[-1]" /> Reply all
                </Button>
                <Button variant="ghost" size="sm" onClick={startForward} className="gap-1 h-8" title="Forward this thread">
                  <Send className="h-3.5 w-3.5 rotate-45" /> Forward
                </Button>
                <Button variant="ghost" size="sm" onClick={archiveThread} className="gap-1 h-8" title="Archive (e)">
                  <Archive className="h-3.5 w-3.5" /> Archive
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {messages.map((m, idx) => {
                // The inbox-replier agent pre-computes ai_suggested_reply
                // on the latest inbound. Surface it as a one-tap chip
                // ONLY on that row — older suggestions are stale.
                const isLatestInbound = m.direction === 'inbound'
                  && messages.slice(idx + 1).every(later => later.direction !== 'inbound')
                return (
                  <MessageCard
                    key={m.id}
                    message={m}
                    showSuggestion={isLatestInbound}
                    onUseSuggestion={(text) => { setDraft(text); composerRef.current?.focus() }}
                  />
                )
              })}
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

              {/* Recipient fields. Single TO row by default; click "Cc"/"Bcc"
                  pills to reveal those fields. Mirrors Superhuman/Gmail.
                  The TO field auto-derives from the open thread but operator
                  can override. */}
              <div className="space-y-1.5 border border-border rounded-md p-2 bg-muted/20">
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-mono uppercase text-muted-foreground w-8">To</Label>
                  <Input
                    value={draftTo || (lead?.email ?? messages.findLast?.(m => m.direction === 'inbound')?.from_email ?? '')}
                    onChange={e => setDraftTo(e.target.value)}
                    placeholder={lead?.email ?? 'someone@example.com'}
                    className="h-7 text-xs flex-1"
                  />
                  <div className="flex items-center gap-1 text-[10px]">
                    {!showCc && (
                      <button type="button" onClick={() => setShowCc(true)} className="text-muted-foreground hover:text-foreground underline">Cc</button>
                    )}
                    {!showBcc && (
                      <button type="button" onClick={() => setShowBcc(true)} className="text-muted-foreground hover:text-foreground underline">Bcc</button>
                    )}
                  </div>
                </div>
                {showCc && (
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] font-mono uppercase text-muted-foreground w-8">Cc</Label>
                    <Input
                      value={draftCc}
                      onChange={e => setDraftCc(e.target.value)}
                      placeholder="comma-separated"
                      className="h-7 text-xs flex-1"
                    />
                    <button type="button" onClick={() => { setShowCc(false); setDraftCc('') }} className="text-muted-foreground hover:text-red-600">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {showBcc && (
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] font-mono uppercase text-muted-foreground w-8">Bcc</Label>
                    <Input
                      value={draftBcc}
                      onChange={e => setDraftBcc(e.target.value)}
                      placeholder="hidden recipients, comma-separated"
                      className="h-7 text-xs flex-1"
                    />
                    <button type="button" onClick={() => { setShowBcc(false); setDraftBcc('') }} className="text-muted-foreground hover:text-red-600">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-mono uppercase text-muted-foreground w-8">Subj</Label>
                  <Input
                    value={draftSubject}
                    onChange={e => setDraftSubject(e.target.value)}
                    placeholder={`Re: ${(messages.findLast?.(m => m.direction === 'inbound')?.subject ?? messages[0]?.subject ?? '').replace(/^(Re:\s*)+/i, '') || '(no subject)'}`}
                    className="h-7 text-xs flex-1"
                  />
                </div>
              </div>

              <Textarea
                ref={composerRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Type a reply. ⌘⏎ to send · r to focus here."
                rows={5}
                className="font-mono text-sm"
              />

              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingAttachments.map(a => (
                    <span key={a.path} className="inline-flex items-center gap-1.5 px-2 py-1 border border-border rounded-md bg-muted/40 text-xs">
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono truncate max-w-[200px]">{a.filename}</span>
                      <span className="text-[10px] text-muted-foreground">{formatBytes(a.size_bytes)}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.path)}
                        className="text-muted-foreground hover:text-red-600"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <input
                ref={attachFileRef}
                type="file"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleAttachFile(f); e.target.value = '' }}
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
                <Button
                  onClick={() => attachFileRef.current?.click()}
                  disabled={uploadingAttachment}
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  title="Attach file (≤25 MB)"
                >
                  {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                  Attach
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

// HTML → plain text. Same shape as the worker-side htmlToText but lives
// here so we render every body — legacy HTML rows included — as
// non-executing text. Eliminates the XSS surface that
// dangerouslySetInnerHTML previously exposed.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<(br|p|div|li|tr|h[1-6])[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x?[0-9a-f]+;/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Split a message body into (current, quoted). Quoted = the reply chain
// already visible above in the thread — collapsed under a toggle so the
// pane doesn't scroll forever in long conversations.
function splitQuoted(body: string): { current: string; quoted: string | null } {
  if (!body) return { current: '', quoted: null }
  const lines = body.split(/\r?\n/)
  // Look for the first "On <date>, <name> wrote:" trailer or first run
  // of '>' lines. Everything after that is quoted.
  let cutAt = -1
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (/^on\s.+wrote:\s*$/i.test(l)) { cutAt = i; break }
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(l)) { cutAt = i; break }
    if (/^from:\s.+\s<.+@.+>$/i.test(l) && i > 0) { cutAt = i; break }
    if (l.startsWith('>')) { cutAt = i; break }
  }
  if (cutAt === -1) return { current: body.trim(), quoted: null }
  const current = lines.slice(0, cutAt).join('\n').trimEnd()
  const quoted  = lines.slice(cutAt).join('\n').trim()
  return { current: current || body.trim(), quoted: quoted || null }
}

interface AttachmentMeta {
  filename: string
  size_bytes: number
  mime: string
  storage_path: string
}

interface MessageCardProps {
  message: MessageRow
  showSuggestion?: boolean
  onUseSuggestion?: (text: string) => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

async function openAttachment(path: string) {
  // Signed URL with 3-minute TTL — enough for the browser to download.
  const { data, error } = await supabase.storage
    .from('inbox-attachments').createSignedUrl(path, 180)
  if (error || !data?.signedUrl) { toast.error(error?.message ?? 'failed to open'); return }
  window.open(data.signedUrl, '_blank')
}

function MessageCard({ message, showSuggestion = false, onUseSuggestion }: MessageCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [showQuoted, setShowQuoted] = useState(false)
  const isInbound = message.direction === 'inbound'
  const suggestion = message.ai_suggested_reply?.trim() ?? ''
  const attachments: AttachmentMeta[] = useMemo(() => {
    const meta = message.metadata as { attachments?: AttachmentMeta[] } | null
    return Array.isArray(meta?.attachments) ? meta!.attachments! : []
  }, [message.metadata])

  const safeBody = useMemo(() => {
    const raw = message.body ?? ''
    const looksHtml = /<[a-z][\s\S]*>/i.test(raw)
    return looksHtml ? htmlToText(raw) : raw
  }, [message.body])
  const { current, quoted } = useMemo(() => splitQuoted(safeBody), [safeBody])

  const senderLabel = isInbound
    ? (message.from_email ?? 'them')
    : (message.from_email ?? 'you')

  return (
    <div className={`rounded-lg border ${isInbound ? 'border-border bg-card' : 'border-primary/20 bg-primary/5'} shadow-sm`}>
      <button onClick={() => setExpanded(o => !o)} className="w-full text-left p-3 flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-mono ${
          isInbound ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
        }`}>{isInbound ? <Reply className="h-3 w-3" /> : <Send className="h-3 w-3" />}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">
            {senderLabel}
            {message.ai_category && <span className="ml-2 text-[10px] text-muted-foreground font-mono">{message.ai_category}</span>}
          </p>
          <p className="text-[11px] text-muted-foreground">{new Date(message.received_at).toLocaleString()}</p>
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-3">
          <pre className="text-sm whitespace-pre-wrap font-sans">{current}</pre>
          {quoted && (
            <div className="mt-2">
              <button
                onClick={() => setShowQuoted(s => !s)}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                {showQuoted ? 'Hide quoted text' : 'Show quoted text'}
              </button>
              {showQuoted && (
                <pre className="mt-2 text-xs whitespace-pre-wrap font-sans text-muted-foreground border-l-2 border-muted pl-3">{quoted}</pre>
              )}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <button
                  key={i}
                  onClick={() => openAttachment(a.storage_path)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-md bg-muted/40 hover:bg-muted/70 text-xs transition-colors"
                  title={`${a.mime} · ${formatBytes(a.size_bytes)}`}
                >
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono truncate max-w-[200px]">{a.filename}</span>
                  <span className="text-[10px] text-muted-foreground">{formatBytes(a.size_bytes)}</span>
                  <Download className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
          {showSuggestion && suggestion && onUseSuggestion && (
            <button
              type="button"
              onClick={() => onUseSuggestion(suggestion)}
              className="mt-3 w-full text-left bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-md px-3 py-2 transition-colors group"
              title="Click to load this AI-drafted reply into the composer"
            >
              <p className="text-[10px] font-mono uppercase tracking-wider text-primary/70 mb-0.5 inline-flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                AI suggested reply
                <span className="ml-auto text-primary/50 group-hover:text-primary text-[10px] normal-case tracking-normal">click to use →</span>
              </p>
              <p className="text-xs text-foreground/80 line-clamp-3 leading-relaxed">{suggestion}</p>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

