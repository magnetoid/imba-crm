import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { callAIJSON, getCRMRuntimeSettings } from '@/lib/ai'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import {
  Inbox, Mail, Sparkles, Loader2, Plus, Archive, Reply,
  ArrowDownLeft, ArrowUpRight, AlertCircle, CheckCircle2, MessageSquare, Search,
} from 'lucide-react'

interface InboxMessage {
  id: string
  lead_id: string | null
  direction: 'inbound' | 'outbound'
  subject: string | null
  body: string
  from_email: string | null
  to_email: string | null
  status: string
  ai_sentiment: string | null
  ai_category: string | null
  ai_suggested_reply: string | null
  received_at: string
  crm_leads?: { name: string; company: string } | null
}

interface CRMLead { id: string; name: string; company: string; email: string }

const SENTIMENT_COLOR: Record<string, string> = {
  positive: 'text-emerald-400 border-emerald-400/30',
  neutral:  'text-muted-foreground border-border',
  negative: 'text-red-400 border-red-400/30',
}
const CATEGORY_ICON: Record<string, typeof Mail> = {
  question: MessageSquare, objection: AlertCircle, meeting_request: CheckCircle2, bounce: AlertCircle,
}

export default function AIInbox() {
    const [messages, setMessages] = useState<InboxMessage[]>([])
  const [leads, setLeads] = useState<CRMLead[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<InboxMessage | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread' | 'inbound' | 'outbound'>('all')
  const [search, setSearch] = useState('')
  const [addDialog, setAddDialog] = useState(false)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({
    lead_id: '', direction: 'inbound' as 'inbound' | 'outbound',
    subject: '', body: '', from_email: '', to_email: '',
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [msgsRes, leadsRes] = await Promise.all([
      supabase.from('crm_inbox_messages').select('*, crm_leads(name, company)').order('received_at', { ascending: false }),
      supabase.from('crm_leads').select('id,name,company,email').order('name'),
    ])
    setMessages((msgsRes.data as InboxMessage[]) || [])
    setLeads((leadsRes.data as CRMLead[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function analyzeMessage(msg: InboxMessage) {
    setAnalyzing(msg.id)
    const prompt = `Analyze this email reply to a video production sales outreach.

From: ${msg.from_email || 'unknown'}
Subject: ${msg.subject || '(no subject)'}
Body: ${msg.body}

Return ONLY valid JSON: {"sentiment":"positive|neutral|negative","category":"question|objection|meeting_request|bounce","suggested_reply":"string"}`
    try {
      const json = await callAIJSON<{ sentiment: string; category: string; suggested_reply: string }>(prompt, { maxTokens: 500 })
      await supabase.from('crm_inbox_messages').update({ ai_sentiment: json.sentiment, ai_category: json.category, ai_suggested_reply: json.suggested_reply, status: 'read' }).eq('id', msg.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ai_sentiment: json.sentiment, ai_category: json.category, ai_suggested_reply: json.suggested_reply, status: 'read' } : m))
      if (selected?.id === msg.id) setSelected(p => p ? { ...p, ai_sentiment: json.sentiment, ai_category: json.category, ai_suggested_reply: json.suggested_reply, status: 'read' } : p)
      toast.success('Message analyzed')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Analysis failed') }
    setAnalyzing(null)
  }

  async function archiveMessage(id: string) {
    await supabase.from('crm_inbox_messages').update({ status: 'archived' }).eq('id', id)
    setMessages(prev => prev.filter(m => m.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  async function handleAdd() {
    setSaving(true)
    await supabase.from('crm_inbox_messages').insert({
      lead_id: addForm.lead_id || null, direction: addForm.direction,
      subject: addForm.subject || null, body: addForm.body,
      from_email: addForm.from_email || null, to_email: addForm.to_email || null, status: 'unread',
    })
    setAddDialog(false)
    setAddForm({ lead_id: '', direction: 'inbound', subject: '', body: '', from_email: '', to_email: '' })
    setSaving(false)
    toast.success('Message logged')
    load()
  }

  const displayMessages = messages.filter(m => {
    if (m.status === 'archived') return false
    if (filter === 'unread') return m.status === 'unread'
    if (filter === 'inbound') return m.direction === 'inbound'
    if (filter === 'outbound') return m.direction === 'outbound'
    return true
  }).filter(m =>
    !search ||
    m.subject?.toLowerCase().includes(search.toLowerCase()) ||
    m.from_email?.toLowerCase().includes(search.toLowerCase()) ||
    m.crm_leads?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const unreadCount = messages.filter(m => m.status === 'unread').length

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Inbox className="h-5 w-5 text-amber-500" />
          <h1 className="text-2xl font-semibold">Inbox</h1>
          {unreadCount > 0 && <Badge className="bg-amber-500 text-black text-xs">{unreadCount}</Badge>}
        </div>
        <Button size="sm" className="gap-2 bg-amber-500 hover:bg-amber-600 text-black" onClick={() => setAddDialog(true)}>
          <Plus className="h-4 w-4" /> Log message
        </Button>
      </div>
      <p className="text-muted-foreground text-sm mb-8">Track inbound replies and outbound messages. AI analyzes sentiment and generates replies.</p>

      {/* Filters + Search */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {(['all', 'unread', 'inbound', 'outbound'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${filter === f ? 'bg-amber-500/15 text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)} ({f === 'all'
              ? messages.filter(m => m.status !== 'archived').length
              : messages.filter(m => m.status !== 'archived' && (f === 'unread' ? m.status === 'unread' : m.direction === f)).length})
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-8 h-8 text-sm w-48" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List */}
        <div className="flex flex-col gap-2">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : displayMessages.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No messages. Log one above.</p>
            </div>
          ) : displayMessages.map(msg => {
            const CatIcon = CATEGORY_ICON[msg.ai_category || ''] || Mail
            return (
              <button key={msg.id} onClick={() => { setSelected(msg); if (msg.status === 'unread' && !msg.ai_sentiment) { void getCRMRuntimeSettings().then(runtime => { if (runtime.ai_inbox_auto_categorize) void analyzeMessage(msg) }) } }}
                className={`text-left p-4 bg-card border rounded-lg transition-all ${selected?.id === msg.id ? 'border-amber-500/40 bg-amber-500/5' : `border-border hover:border-border/60 ${msg.status === 'unread' ? 'border-l-2 border-l-amber-400' : ''}`}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  {msg.direction === 'inbound'
                    ? <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                    : <ArrowUpRight className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />}
                  <span className="text-sm font-medium truncate">{msg.crm_leads?.name || msg.from_email || 'Unknown'}</span>
                  {msg.status === 'unread' && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                  <div className="flex-1" />
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{new Date(msg.received_at).toLocaleDateString()}</span>
                </div>
                {msg.subject && <p className="text-xs font-medium mb-1">{msg.subject}</p>}
                <p className="text-xs text-muted-foreground line-clamp-2">{msg.body}</p>
                {(msg.ai_sentiment || msg.ai_category) && (
                  <div className="flex items-center gap-1.5 mt-2">
                    {msg.ai_category && <CatIcon className="h-3 w-3 text-muted-foreground" />}
                    {msg.ai_sentiment && <span className={`text-[10px] ${SENTIMENT_COLOR[msg.ai_sentiment]?.split(' ')[0]}`}>{msg.ai_sentiment}</span>}
                    {msg.ai_category && <span className="text-[10px] text-muted-foreground">· {msg.ai_category.replace('_', ' ')}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Detail */}
        <div className="lg:sticky lg:top-6 self-start">
          {selected ? (
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="font-medium">{selected.crm_leads?.name || selected.from_email}</p>
                  {selected.crm_leads?.company && <p className="text-xs text-muted-foreground">{selected.crm_leads.company}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">{new Date(selected.received_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-1.5">
                  {!selected.ai_sentiment && selected.direction === 'inbound' && (
                    <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => analyzeMessage(selected)} disabled={analyzing === selected.id}>
                      {analyzing === selected.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-amber-500" />}
                      Analyze
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs text-muted-foreground" onClick={() => archiveMessage(selected.id)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {selected.subject && <p className="font-medium text-sm mb-3">{selected.subject}</p>}
              <div className="bg-background rounded p-3 mb-4 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                {selected.body}
              </div>

              {selected.ai_sentiment && (
                <div className="flex gap-2 mb-4">
                  <Badge variant="outline" className={`text-xs ${SENTIMENT_COLOR[selected.ai_sentiment] || ''}`}>
                    {selected.ai_sentiment}
                  </Badge>
                  {selected.ai_category && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {selected.ai_category.replace('_', ' ')}
                    </Badge>
                  )}
                </div>
              )}

              {selected.ai_suggested_reply && (
                <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs font-mono text-amber-500/70 tracking-widest uppercase">AI suggested reply</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{selected.ai_suggested_reply}</p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" className="h-7 text-xs gap-1.5 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/20"
                      onClick={() => window.open(`mailto:${selected.from_email || ''}?subject=Re: ${encodeURIComponent(selected.subject || '')}&body=${encodeURIComponent(selected.ai_suggested_reply || '')}`)}>
                      <Reply className="h-3 w-3" /> Use in mail client
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => { navigator.clipboard.writeText(selected.ai_suggested_reply || ''); toast.success('Copied!') }}>
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-dashed border-border rounded-lg p-12 text-center text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a message to view</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log a message</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Direction</Label>
                <Select value={addForm.direction} onValueChange={v => setAddForm(p => ({ ...p, direction: v as 'inbound' | 'outbound' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">Inbound (they wrote to us)</SelectItem>
                    <SelectItem value="outbound">Outbound (we wrote to them)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Lead</Label>
                <Select value={addForm.lead_id} onValueChange={v => setAddForm(p => ({ ...p, lead_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Link to lead" /></SelectTrigger>
                  <SelectContent>{leads.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>From email</Label>
                <Input value={addForm.from_email} onChange={e => setAddForm(p => ({ ...p, from_email: e.target.value }))} placeholder="sender@domain.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>To email</Label>
                <Input value={addForm.to_email} onChange={e => setAddForm(p => ({ ...p, to_email: e.target.value }))} placeholder="recipient@domain.com" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Subject</Label>
              <Input value={addForm.subject} onChange={e => setAddForm(p => ({ ...p, subject: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Body *</Label>
              <Textarea value={addForm.body} onChange={e => setAddForm(p => ({ ...p, body: e.target.value }))} rows={5} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !addForm.body}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Log message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
