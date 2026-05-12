import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@imba/shared/supabase'
import { buildCompanyContext, callAIJSON, getCRMRuntimeSettings } from '@imba/shared/lib/ai'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Badge } from '@imba/shared/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@imba/shared/ui/dialog'
import { Label } from '@imba/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@imba/shared/ui/select'
import { Textarea } from '@imba/shared/ui/textarea'

import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Plus, Loader2, Sparkles, Users, TrendingUp, DollarSign, Target, ArrowRight, Import, Trophy, ChevronRight, ChevronLeft, Bell, GripVertical } from 'lucide-react'
import toast from 'react-hot-toast'
import { autoScoreLead, logActivity, requestNotificationPermission, showNotification } from '@/lib/crm-utils'
import { logGeneration } from '@/lib/aiGenerations'
import { logError } from '@/lib/logError'
import NomoBrief from './NomoBrief'
import OnboardingCard from './OnboardingCard'

export interface CRMLead {
  id: string
  name: string
  email?: string
  company?: string
  phone?: string
  website?: string
  source: string
  quote_request_id?: string
  stage: string
  value?: number
  probability: number
  service_interest?: string
  budget_range?: string
  notes?: string
  ai_score?: number
  ai_notes?: string
  fit_score?: number
  intent_score?: number
  engagement_score?: number
  last_scored_at?: string
  deal_health?: 'green' | 'yellow' | 'red'
  deal_health_reason?: string
  stage_entered_at?: string
  exit_checklist?: Record<string, boolean>
  last_contacted_at?: string
  next_follow_up?: string
  tags?: string[]
  created_at: string
  updated_at: string
  /** Populated client-side from crm_lead_sequences. Not on the DB row. */
  active_sequence?: { id: string; name: string; current_step: number; total_steps: number; next_due_at: string }
}

interface SavedView {
  id: string
  name: string
  filter: { stages?: string[]; tags?: string[]; fit_min?: number; intent_min?: number; search?: string; health?: ('red'|'yellow'|'green')[] }
  pinned: boolean
}

// Composite "next-best-action" score used to rank leads inside a stage.
// We use fit×intent because both must be > 0 for a lead to be worth
// chasing. Falls back to ai_score, then to recency.
function nextBestActionScore(l: { fit_score?: number; intent_score?: number; ai_score?: number }): number {
  const f = l.fit_score ?? -1
  const i = l.intent_score ?? -1
  if (f >= 0 && i >= 0) return f * i
  if (l.ai_score != null) return l.ai_score * 50
  return -1
}

export const STAGES: { key: string; label: string; color: string }[] = [
  { key: 'new',          label: 'New',           color: '#6C7AE0' },
  { key: 'qualified',    label: 'Qualified',     color: '#3CBFAE' },
  { key: 'proposal',     label: 'Proposal Sent', color: '#C9A96E' },
  { key: 'negotiation',  label: 'Negotiation',   color: '#E87A2A' },
  { key: 'won',          label: 'Won',           color: '#22c55e' },
  { key: 'lost',         label: 'Lost',          color: '#64748b' },
]

const SOURCES = ['manual', 'quote_form', 'referral', 'cold_outreach', 'social', 'event']

const EMPTY_FORM = {
  name: '', email: '', company: '', phone: '', website: '',
  source: 'manual', stage: 'new', value: '', probability: '50',
  service_interest: '', budget_range: '', notes: '',
}

export default function CRMDashboard() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState<CRMLead[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [healthFilter, setHealthFilter] = useState<'red'|'yellow'|'green'|null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [bulkActing, setBulkActing] = useState(false)
    const [scoringId, setScoringId] = useState<string | null>(null)
  const [bulkScoring, setBulkScoring] = useState(false)
  const [importingQuotes, setImportingQuotes] = useState(false)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null)
  const [importResult, setImportResult] = useState<{ ok: number; skipped: number; failed: number; error?: string } | null>(null)

  const loadLeads = useCallback(async () => {
    setLoading(true)
    const [leadsRes, sequencesRes, templatesRes] = await Promise.all([
      supabase.from('crm_leads').select('*').order('created_at', { ascending: false }),
      supabase.from('crm_lead_sequences')
        .select('id, lead_id, sequence_id, current_step, status, next_due_at')
        .eq('status', 'active'),
      supabase.from('crm_outreach_sequences').select('id, name, steps'),
    ])
    const leads = (leadsRes.data || []) as CRMLead[]
    const seqs = (sequencesRes.data || []) as Array<{ id: string; lead_id: string; sequence_id: string; current_step: number; next_due_at: string }>
    const tpls = new Map<string, { name: string; total_steps: number }>()
    for (const t of (templatesRes.data || []) as Array<{ id: string; name: string; steps: unknown[] }>) {
      tpls.set(t.id, { name: t.name, total_steps: Array.isArray(t.steps) ? t.steps.length : 0 })
    }
    const seqByLead = new Map<string, CRMLead['active_sequence']>()
    for (const s of seqs) {
      const tpl = tpls.get(s.sequence_id)
      seqByLead.set(s.lead_id, {
        id: s.id,
        name: tpl?.name ?? 'sequence',
        current_step: s.current_step,
        total_steps: tpl?.total_steps ?? 0,
        next_due_at: s.next_due_at,
      })
    }
    for (const l of leads) {
      const a = seqByLead.get(l.id)
      if (a) l.active_sequence = a
    }
    setLeads(leads)
    setLoading(false)
  }, [])

  useEffect(() => { loadLeads() }, [loadLeads])

  // ── Saved views ──────────────────────────────────────────────────
  const loadSavedViews = useCallback(async () => {
    const { data } = await supabase
      .from('crm_saved_views').select('id, name, filter, pinned')
      .order('pinned', { ascending: false }).order('name')
    setSavedViews((data as SavedView[] | null) ?? [])
  }, [])
  useEffect(() => { void loadSavedViews() }, [loadSavedViews])

  function applyView(v: SavedView) {
    setActiveViewId(v.id)
    setStageFilter(v.filter.stages?.[0] ?? null)
    setSearch(v.filter.search ?? '')
    setTagFilter(v.filter.tags?.[0] ?? null)
    setHealthFilter(v.filter.health?.[0] ?? null)
  }
  function clearView() {
    setActiveViewId(null)
    setStageFilter(null); setSearch(''); setTagFilter(null); setHealthFilter(null)
  }
  async function saveCurrentAsView() {
    const name = window.prompt('Name this view (e.g. "Q1 hot SaaS")')?.trim()
    if (!name) return
    const filter: SavedView['filter'] = {
      ...(stageFilter ? { stages: [stageFilter] } : {}),
      ...(search ? { search } : {}),
      ...(tagFilter ? { tags: [tagFilter] } : {}),
      ...(healthFilter ? { health: [healthFilter] } : {}),
    }
    const userRes = await supabase.auth.getUser()
    const { data, error } = await supabase.from('crm_saved_views').insert({
      user_id: userRes.data.user?.id ?? null, name, filter, pinned: true,
    }).select('id, name, filter, pinned').maybeSingle()
    if (error) { toast.error(error.message); return }
    if (data) {
      const v = data as SavedView
      setSavedViews(prev => [v, ...prev])
      setActiveViewId(v.id)
      toast.success(`Saved view "${v.name}"`)
    }
  }
  async function deleteView(id: string) {
    if (!window.confirm('Delete this saved view?')) return
    await supabase.from('crm_saved_views').delete().eq('id', id)
    setSavedViews(prev => prev.filter(v => v.id !== id))
    if (activeViewId === id) clearView()
  }

  // ── Bulk actions ─────────────────────────────────────────────────
  function toggleSelect(id: string, ev: React.MouseEvent) {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey) {
      ev.preventDefault(); ev.stopPropagation()
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
      })
      return true   // signal to caller to suppress navigation
    }
    return false
  }
  function clearSelection() { setSelectedIds(new Set()) }
  async function bulkSetStage(stage: string) {
    if (selectedIds.size === 0) return
    setBulkActing(true)
    let ok = 0, blocked = 0
    for (const id of selectedIds) {
      const { data } = await supabase.rpc('move_lead_stage', { p_lead_id: id, p_to_stage: stage })
      const r = data as { ok: boolean } | null
      if (r?.ok) ok++; else blocked++
    }
    setBulkActing(false)
    toast.success(`Stage move: ${ok} ok${blocked ? `, ${blocked} blocked by exit-criteria` : ''}`)
    clearSelection(); loadLeads()
  }
  async function bulkAssignSequence(sequenceId: string) {
    if (selectedIds.size === 0) return
    setBulkActing(true)
    for (const id of selectedIds) {
      await supabase.from('crm_lead_sequences').update({
        status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_reason: 'bulk_replaced',
      }).eq('lead_id', id).in('status', ['active', 'paused'])
      await supabase.from('crm_lead_sequences').insert({ lead_id: id, sequence_id: sequenceId, next_due_at: new Date().toISOString() })
    }
    setBulkActing(false)
    toast.success(`Started sequence on ${selectedIds.size} leads`)
    clearSelection(); loadLeads()
  }
  async function bulkAddTag(tag: string) {
    if (!tag.trim() || selectedIds.size === 0) return
    setBulkActing(true)
    for (const id of selectedIds) {
      const lead = leads.find(l => l.id === id)
      const cur  = lead?.tags ?? []
      if (cur.includes(tag)) continue
      await supabase.from('crm_leads').update({ tags: [...cur, tag] }).eq('id', id)
    }
    setBulkActing(false)
    toast.success(`Tagged "${tag}" on ${selectedIds.size} leads`)
    clearSelection(); loadLeads()
  }
  async function bulkSnooze(days: number) {
    if (selectedIds.size === 0) return
    setBulkActing(true)
    const next = new Date(Date.now() + days * 86400_000).toISOString()
    for (const id of selectedIds) {
      await supabase.from('crm_leads').update({ next_follow_up: next }).eq('id', id)
    }
    setBulkActing(false)
    toast.success(`Snoozed ${selectedIds.size} leads ${days}d`)
    clearSelection(); loadLeads()
  }
  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} leads? This is permanent.`)) return
    setBulkActing(true)
    await supabase.from('crm_leads').delete().in('id', Array.from(selectedIds))
    setBulkActing(false)
    toast.success(`Deleted ${selectedIds.size} leads`)
    clearSelection(); loadLeads()
  }

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const l of leads) for (const t of (l.tags ?? [])) s.add(t)
    return Array.from(s).sort()
  }, [leads])

  // ── Overdue follow-up browser notifications ─────────────
  useEffect(() => {
    if (loading) return
    const overdueLeads = leads.filter(l => {
      if (!l.next_follow_up || ['won', 'lost'].includes(l.stage)) return false
      return new Date(l.next_follow_up) < new Date()
    })
    if (overdueLeads.length === 0) return

    const shownKey = 'crm_notified_leads'
    const shown: string[] = JSON.parse(sessionStorage.getItem(shownKey) || '[]')
    const fresh = overdueLeads.filter(l => !shown.includes(l.id))
    if (fresh.length === 0) return

    requestNotificationPermission().then(granted => {
      if (!granted) return
      fresh.forEach(lead => {
        showNotification(
          `Follow-up overdue: ${lead.name}`,
          `${lead.company || 'Lead'} — ${lead.service_interest || 'needs follow-up'}`,
          () => navigate(`/admin/crm/${lead.id}`)
        )
      })
      sessionStorage.setItem(shownKey, JSON.stringify([...shown, ...fresh.map(l => l.id)]))
    })
  }, [leads, loading, navigate])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    const { error: err } = await supabase.from('crm_leads').insert([{
      ...form,
      value: form.value ? parseFloat(form.value) : null,
      probability: parseInt(form.probability, 10) || 50,
    }])
    setSaving(false)
    if (err) { setError(err.message); return }
    setAddOpen(false)
    setForm(EMPTY_FORM)
    loadLeads()
  }

  async function importFromQuotes() {
    setImportingQuotes(true)
    setImportResult(null)
    setImportProgress(null)

    const { data: quotes, error: quotesErr } = await supabase
      .from('quote_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (quotesErr) {
      setImportResult({ ok: 0, skipped: 0, failed: 0, error: `Failed to fetch quotes: ${quotesErr.message}` })
      setImportingQuotes(false)
      return
    }

    if (!quotes?.length) {
      setImportResult({ ok: 0, skipped: 0, failed: 0, error: 'No quote requests found in the database.' })
      setImportingQuotes(false)
      return
    }

    const { data: existing, error: existingErr } = await supabase
      .from('crm_leads')
      .select('quote_request_id')
      .not('quote_request_id', 'is', null)

    if (existingErr) {
      setImportResult({ ok: 0, skipped: 0, failed: 0, error: `Failed to check existing leads: ${existingErr.message}` })
      setImportingQuotes(false)
      return
    }

    const existingIds = new Set((existing || []).map(r => r.quote_request_id))
    const toImport = quotes.filter(q => !existingIds.has(q.id))
    const skipped = quotes.length - toImport.length

    if (toImport.length === 0) {
      setImportResult({ ok: 0, skipped, failed: 0 })
      setImportingQuotes(false)
      loadLeads()
      return
    }

    const { data: settingsRow } = await supabase.from('crm_runtime_settings').select('auto_score_on_import').eq('id', 1).maybeSingle()
    const autoScore = settingsRow?.auto_score_on_import !== false

    let ok = 0
    let failed = 0
    for (let i = 0; i < toImport.length; i++) {
      const q = toImport[i]
      setImportProgress({ current: i + 1, total: toImport.length })
      const { data: inserted, error: insertErr } = await supabase.from('crm_leads').insert({
        name: q.full_name || q.name || 'Unknown',
        email: q.email,
        company: q.company || null,
        phone: q.phone || null,
        source: 'quote_form',
        quote_request_id: q.id,
        stage: 'new',
        service_interest: q.service_type || null,
        budget_range: q.budget_range || null,
        notes: q.message || null,
        probability: 50,
      }).select('id, name, company, service_interest, budget_range, source, notes').single()

      if (insertErr) {
        console.error('Import error for quote', q.id, insertErr.message)
        failed++
      } else {
        ok++
        if (autoScore && inserted) {
          autoScoreLead(inserted).catch(err => logError(err, { where: 'autoScoreLead', leadId: inserted.id }, { silent: true }))
        }
      }
    }

    setImportProgress(null)
    setImportResult({ ok, skipped, failed })
    setImportingQuotes(false)
    loadLeads()
  }

  async function scoreWithAI(lead: CRMLead) {
    setScoringId(lead.id)
    const runtime = await getCRMRuntimeSettings()
    const prompt = `You are a B2B sales expert for Imba Production.
${buildCompanyContext(runtime)}

Score this lead from 0-100 and give a brief follow-up recommendation.
- Name: ${lead.name}
- Company: ${lead.company || 'Unknown'}
- Service interest: ${lead.service_interest || 'Unknown'}
- Budget: ${lead.budget_range || 'Unknown'}
- Notes: ${lead.notes || 'None'}
- Stage: ${lead.stage}

Return ONLY valid JSON: {"score": NUMBER, "notes": "2-3 sentence follow-up recommendation"}`
    try {
      const parsed = await callAIJSON<{ score: number; notes: string }>(prompt, { maxTokens: 512 })
      await supabase.from('crm_leads').update({
        ai_score: parsed.score,
        ai_notes: parsed.notes,
        last_ai_scored_at: new Date().toISOString(),
      }).eq('id', lead.id)
      setLeads(l => l.map(x => x.id === lead.id ? { ...x, ai_score: parsed.score, ai_notes: parsed.notes } : x))
      void logGeneration({
        feature: 'lead_score',
        taskType: 'classification',
        leadId: lead.id,
        input: prompt,
        output: JSON.stringify(parsed),
        inputMeta: { source: 'CRMDashboard.scoreWithAI' },
        provider: runtime.active_ai_provider,
        model: runtime.active_ai_model,
      })
    } catch (error) {
      void logGeneration({
        feature: 'lead_score',
        taskType: 'classification',
        leadId: lead.id,
        input: prompt,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    setScoringId(null)
  }

  async function bulkScoreUnscored() {
    const unscored = leads.filter(l => l.ai_score == null && !['won', 'lost'].includes(l.stage))
    if (!unscored.length) { alert('All active leads are already scored.'); return }
    setBulkScoring(true)
    for (const lead of unscored) {
      await scoreWithAI(lead)
    }
    setBulkScoring(false)
  }

  // ── Drag & Drop handler ──────────────────────────────────
  async function changeStage(lead: CRMLead, newStage: string) {
    if (lead.stage === newStage) return
    // Validate exit criteria via the RPC. Optimistic update; rollback
    // (and toast the missing items) if blocked.
    const previousStage = lead.stage
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: newStage } : l))
    const { data, error } = await supabase.rpc('move_lead_stage', { p_lead_id: lead.id, p_to_stage: newStage })
    if (error) {
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: previousStage } : l))
      toast.error(error.message)
      return
    }
    const result = data as { ok: boolean; missing?: string[]; error?: string } | null
    if (!result?.ok) {
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: previousStage } : l))
      const missing = result?.missing?.length ? ` Missing: ${result.missing.join(', ')}` : ''
      toast.error(`Can't move to ${newStage}.${missing}`)
      return
    }
    logActivity(lead.id, 'note', `Stage changed: ${previousStage} → ${newStage}`)

    // Auto-action: when moved to "won", create an invoice from signed proposal
    if (newStage === 'won') {
      const { data: settings } = await supabase.from('crm_runtime_settings').select('auto_invoice_on_won').eq('id', 1).maybeSingle()
      if (settings && settings.auto_invoice_on_won === false) return

      const { data: signedProposal } = await supabase
        .from('crm_proposals')
        .select('*')
        .eq('lead_id', lead.id)
        .eq('status', 'signed')
        .order('signed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data: existingInvoice } = await supabase
        .from('crm_invoices')
        .select('id')
        .eq('lead_id', lead.id)
        .limit(1)
        .maybeSingle()

      if (existingInvoice) return

      const amount = signedProposal?.amount || lead.value || 0
      if (amount <= 0) return

      const now = new Date()
      const invoiceNumber = `INV-${now.getFullYear().toString().slice(2)}${(now.getMonth() + 1).toString().padStart(2, '0')}-${Math.floor(Math.random() * 900 + 100)}`
      const dueDate = new Date(now.getTime() + 14 * 86400000).toISOString().split('T')[0]

      const { error: invErr } = await supabase.from('crm_invoices').insert({
        lead_id: lead.id,
        proposal_id: signedProposal?.id || null,
        invoice_number: invoiceNumber,
        amount,
        tax: 0,
        total: amount,
        currency: 'USD',
        due_date: dueDate,
        status: 'draft',
      })

      if (!invErr) {
        logActivity(lead.id, 'invoice', `Invoice ${invoiceNumber} auto-created`, `$${amount.toLocaleString()}`)
        toast.success(`Deal won! Invoice ${invoiceNumber} auto-created.`)
      }
    }
  }

  async function onDragEnd(result: DropResult) {
    const { draggableId, destination } = result
    if (!destination) return
    const lead = leads.find(l => l.id === draggableId)
    if (!lead) return
    changeStage(lead, destination.droppableId)
  }

  async function quickMoveStage(lead: CRMLead, direction: 'forward' | 'back') {
    const stageKeys = STAGES.map(s => s.key)
    const idx = stageKeys.indexOf(lead.stage)
    const newIdx = direction === 'forward' ? idx + 1 : idx - 1
    if (newIdx < 0 || newIdx >= stageKeys.length) return
    changeStage(lead, stageKeys[newIdx])
  }

  const filtered = leads.filter(l => {
    const matchesSearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.company?.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase())
    const matchesStage  = !stageFilter || l.stage === stageFilter
    const matchesTag    = !tagFilter   || (l.tags ?? []).includes(tagFilter)
    const matchesHealth = !healthFilter || l.deal_health === healthFilter
    return matchesSearch && matchesStage && matchesTag && matchesHealth
  })

  // Pipeline stats
  const totalValue = leads.filter(l => l.stage !== 'lost').reduce((s, l) => s + (l.value || 0), 0)
  const wonValue = leads.filter(l => l.stage === 'won').reduce((s, l) => s + (l.value || 0), 0)
  const activeLeads = leads.filter(l => !['won', 'lost'].includes(l.stage)).length
  const wonLeads = leads.filter(l => l.stage === 'won').length
  const closedLeads = leads.filter(l => ['won', 'lost'].includes(l.stage)).length
  const winRate = closedLeads > 0 ? Math.round((wonLeads / closedLeads) * 100) : 0

  const overdueCount = leads.filter(l => {
    if (!l.next_follow_up || ['won', 'lost'].includes(l.stage)) return false
    return new Date(l.next_follow_up) < new Date()
  }).length

  function stageColor(stage: string) {
    return STAGES.find(s => s.key === stage)?.color || '#6C7AE0'
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-muted-foreground tracking-widest uppercase">AI CRM</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-amber-50 text-amber-700 border border-amber-200">
              Powered by Claude
            </span>
            {overdueCount > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-mono bg-red-50 text-red-700 border border-red-200">
                <Bell className="h-3 w-3" />{overdueCount} overdue
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Lead Pipeline</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={bulkScoreUnscored} disabled={bulkScoring}>
            {bulkScoring ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Score all
          </Button>
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" size="sm" onClick={importFromQuotes} disabled={importingQuotes}>
              {importingQuotes
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    {importProgress ? `${importProgress.current}/${importProgress.total}` : 'Fetching…'}
                  </>
                : <><Import className="h-3.5 w-3.5 mr-1.5" />Import quotes</>}
            </Button>
            {importResult && (
              <p className={`text-xs font-mono ${importResult.error ? 'text-red-700' : importResult.ok > 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                {importResult.error
                  ? `⚠ ${importResult.error}`
                  : importResult.ok === 0 && importResult.skipped > 0
                    ? `All ${importResult.skipped} already imported`
                    : `✓ ${importResult.ok} imported${importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ''}${importResult.failed > 0 ? `, ${importResult.failed} failed` : ''}`
                }
              </p>
            )}
          </div>
          <Button onClick={() => { setForm(EMPTY_FORM); setError(''); setAddOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />Add lead
          </Button>
        </div>
      </div>

      {/* First-run onboarding (only renders when something is missing) */}
      <OnboardingCard leadsCount={leads.length} />

      {/* Nomo daily brief */}
      <NomoBrief />

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { icon: Users,      label: 'Total leads',    value: leads.length.toString() },
          { icon: Target,     label: 'Active',         value: activeLeads.toString() },
          { icon: DollarSign, label: 'Pipeline value', value: totalValue ? `$${totalValue.toLocaleString()}` : '—' },
          { icon: TrendingUp, label: 'Won value',      value: wonValue ? `$${wonValue.toLocaleString()}` : '—' },
          { icon: Trophy,     label: 'Win rate',       value: closedLeads > 0 ? `${winRate}%` : '—' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Saved views */}
      {(savedViews.length > 0 || activeViewId) && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mr-1">Views:</span>
          {savedViews.map(v => (
            <button
              key={v.id}
              onClick={() => activeViewId === v.id ? clearView() : applyView(v)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                activeViewId === v.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              {v.name}
              {activeViewId === v.id && (
                <span
                  onClick={e => { e.stopPropagation(); void deleteView(v.id) }}
                  className="ml-1 opacity-70 hover:opacity-100"
                >×</span>
              )}
            </button>
          ))}
          {(stageFilter || search || tagFilter || healthFilter) && !activeViewId && (
            <button onClick={saveCurrentAsView} className="text-xs px-2.5 py-1 rounded-full border border-dashed border-primary text-primary hover:bg-primary/5">
              + Save as view
            </button>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Input
          value={search}
          onChange={e => { setSearch(e.target.value); setActiveViewId(null) }}
          placeholder="Search leads…"
          className="max-w-xs"
        />
        <div className="flex border border-border rounded-md overflow-hidden">
          {(['kanban', 'list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-mono transition-colors ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {v === 'kanban' ? 'Board' : 'List'}
            </button>
          ))}
        </div>
        {/* Health + tag pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['red','yellow','green'] as const).map(h => {
            const active = healthFilter === h
            const colors = { red: 'bg-red-500', yellow: 'bg-amber-500', green: 'bg-emerald-500' }
            return (
              <button
                key={h}
                onClick={() => { setHealthFilter(active ? null : h); setActiveViewId(null) }}
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  active ? 'border-foreground' : 'border-border text-muted-foreground hover:border-muted-foreground'
                }`}
                title={`Filter to ${h} deal health`}
              >
                <span className={`w-2 h-2 rounded-full ${colors[h]}`} />
                {h}
              </button>
            )
          })}
          {allTags.slice(0, 8).map(t => {
            const active = tagFilter === t
            return (
              <button
                key={t}
                onClick={() => { setTagFilter(active ? null : t); setActiveViewId(null) }}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  active ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:border-muted-foreground'
                }`}
              >#{t}</button>
            )
          })}
        </div>
      </div>

      {/* Stage filter chips */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setStageFilter(null)}
          className={`text-xs px-3 py-1 rounded-full border transition-all font-mono ${!stageFilter ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}
        >
          All
        </button>
        {STAGES.map(s => {
          const count = leads.filter(l => l.stage === s.key).length
          const active = stageFilter === s.key
          return (
            <button
              key={s.key}
              onClick={() => setStageFilter(active ? null : s.key)}
              className={`text-xs px-3 py-1 rounded-full border transition-all font-mono ${active ? 'text-white border-transparent' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}
              style={active ? { background: s.color, borderColor: s.color } : {}}
            >
              {s.label} <span className="opacity-60 ml-1">{count}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : view === 'kanban' ? (
        /* ── KANBAN VIEW with Drag & Drop ── */
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4" style={{ minWidth: `${STAGES.length * 240}px` }}>
              {STAGES.map(stage => {
                // Sort within each stage by fit×intent so the lead the
                // operator should call *next* always floats to the top.
                const stageLeads = filtered.filter(l => l.stage === stage.key)
                  .slice().sort((a, b) => nextBestActionScore(b) - nextBestActionScore(a))
                const stageValue = stageLeads.reduce((s, l) => s + (l.value || 0), 0)
                return (
                  <div key={stage.key} className="flex-1" style={{ minWidth: '220px' }}>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                        <span className="text-xs font-mono tracking-wider uppercase text-muted-foreground">{stage.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {stageValue > 0 && (
                          <span className="text-xs font-mono text-muted-foreground/50">${stageValue.toLocaleString()}</span>
                        )}
                        <span className="text-xs font-mono text-muted-foreground/50">{stageLeads.length}</span>
                      </div>
                    </div>
                    <Droppable droppableId={stage.key}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex flex-col gap-2 min-h-[80px] rounded-lg p-1 transition-colors ${
                            snapshot.isDraggingOver ? 'bg-accent/50 ring-1 ring-primary/20' : ''
                          }`}
                        >
                          {stageLeads.map((lead, index) => (
                            <Draggable key={lead.id} draggableId={lead.id} index={index}>
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  style={{
                                    ...dragProvided.draggableProps.style,
                                    ...(dragSnapshot.isDragging ? { opacity: 0.9 } : {}),
                                  }}
                                >
                                  <LeadCard
                                    lead={lead}
                                    stageColor={stage.color}
                                    stageIndex={STAGES.findIndex(s => s.key === stage.key)}
                                    totalStages={STAGES.length}
                                    onNavigate={(ev) => {
                                      // Cmd/Ctrl/Shift-click → toggle selection,
                                      // plain click → navigate.
                                      if (toggleSelect(lead.id, ev)) return
                                      navigate(`/admin/crm/${lead.id}`)
                                    }}
                                    onScore={() => scoreWithAI(lead)}
                                    onMoveForward={() => quickMoveStage(lead, 'forward')}
                                    onMoveBack={() => quickMoveStage(lead, 'back')}
                                    scoring={scoringId === lead.id}
                                    dragHandleProps={dragProvided.dragHandleProps}
                                    isDragging={dragSnapshot.isDragging}
                                    selected={selectedIds.has(lead.id)}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {stageLeads.length === 0 && !snapshot.isDraggingOver && (
                            <div className="border border-dashed border-border rounded-lg p-4 text-center">
                              <p className="text-xs text-muted-foreground/40">Drop leads here</p>
                            </div>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                )
              })}
            </div>
          </div>
        </DragDropContext>
      ) : (
        /* ── LIST VIEW ── */
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Company</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Stage</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">AI Score</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Value</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Follow-up</th>
                <th className="px-4 py-3 text-right text-xs font-mono text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => {
                const isOverdue = lead.next_follow_up && new Date(lead.next_follow_up) < new Date() && !['won', 'lost'].includes(lead.stage)
                return (
                  <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground">{lead.name}</p>
                        {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.company || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" style={{ borderColor: `${stageColor(lead.stage)}40`, color: stageColor(lead.stage) }}>
                        {STAGES.find(s => s.key === lead.stage)?.label || lead.stage}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {(lead.fit_score != null || lead.intent_score != null) ? (
                        <FitIntentPip fit={lead.fit_score} intent={lead.intent_score} />
                      ) : lead.ai_score != null ? (
                        <AIScorePip score={lead.ai_score} />
                      ) : (
                        <button onClick={() => scoreWithAI(lead)} disabled={scoringId === lead.id}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          {scoringId === lead.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Score
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.value ? `$${lead.value.toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-3">
                      {lead.next_follow_up ? (
                        <span className={`text-xs font-mono ${isOverdue ? 'text-red-700 font-semibold' : 'text-muted-foreground'}`}>
                          {isOverdue ? '⚠ ' : ''}{new Date(lead.next_follow_up).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/crm/${lead.id}`)}>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm mb-4">No leads yet.</p>
              <div className="flex items-center justify-center gap-2">
                <Button size="sm" onClick={() => window.location.href = '/admin/crm/lead-finder'} className="gap-1">
                  Find your first prospects
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setForm(EMPTY_FORM); setError(''); setAddOpen(true) }} className="gap-1">
                  Add manually
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-card border border-border rounded-full shadow-lg pl-4 pr-2 py-2 flex items-center gap-2 max-w-[95vw] flex-wrap">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <span className="h-5 w-px bg-border mx-1" />
          {/* Move stage */}
          <Select onValueChange={(v) => void bulkSetStage(v)}>
            <SelectTrigger className="h-8 text-xs gap-1 w-auto px-3 border-0 bg-muted hover:bg-muted/80">
              <SelectValue placeholder="Move stage" />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Snooze */}
          <Select onValueChange={(v) => void bulkSnooze(parseInt(v, 10))}>
            <SelectTrigger className="h-8 text-xs gap-1 w-auto px-3 border-0 bg-muted hover:bg-muted/80">
              <SelectValue placeholder="Snooze" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 day</SelectItem>
              <SelectItem value="3">3 days</SelectItem>
              <SelectItem value="7">1 week</SelectItem>
              <SelectItem value="14">2 weeks</SelectItem>
            </SelectContent>
          </Select>
          {/* Tag */}
          <Button
            variant="ghost" size="sm" className="h-8 text-xs gap-1.5"
            onClick={() => {
              const t = window.prompt('Add tag (no #)')?.trim().replace(/^#/, '')
              if (t) void bulkAddTag(t)
            }}
            disabled={bulkActing}
          >+ tag</Button>
          {/* Delete */}
          <Button
            variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-red-700 hover:text-red-800 hover:bg-red-50"
            onClick={bulkDelete}
            disabled={bulkActing}
          >Delete</Button>
          <span className="h-5 w-px bg-border mx-1" />
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

      {/* Add lead dialog */}
      <Dialog open={addOpen} onOpenChange={o => { setAddOpen(o); if (!o) setError('') }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add lead</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@company.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Company</Label>
                <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Company name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555…" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Stage</Label>
                <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Source</Label>
                <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Service interest</Label>
                <Input value={form.service_interest} onChange={e => setForm(f => ({ ...f, service_interest: e.target.value }))} placeholder="e.g. Brand Video" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Deal value ($)</Label>
                <Input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="What did they say? Any context…" />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Add lead'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LeadCard({
  lead, stageColor, stageIndex, totalStages, onNavigate, onScore, onMoveForward, onMoveBack, scoring,
  dragHandleProps, isDragging, selected,
}: {
  lead: CRMLead
  stageColor: string
  stageIndex: number
  totalStages: number
  onNavigate: (ev: React.MouseEvent) => void
  onScore: () => void
  onMoveForward: () => void
  onMoveBack: () => void
  scoring: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLElement> | null
  isDragging?: boolean
  selected?: boolean
}) {
  const isOverdue = lead.next_follow_up && new Date(lead.next_follow_up) < new Date() && !['won', 'lost'].includes(lead.stage)
  const healthColor = lead.deal_health === 'red'    ? '#ef4444'
                    : lead.deal_health === 'yellow' ? '#f59e0b'
                    : lead.deal_health === 'green'  ? '#22c55e'
                    : null

  return (
    <div
      className={`border rounded-lg p-3 bg-card hover:border-primary/30 transition-all cursor-pointer group relative ${
        isDragging ? 'shadow-lg ring-2 ring-primary/30 rotate-1' : ''
      } ${selected ? 'border-primary ring-2 ring-primary/40 bg-primary/5' : 'border-border'}`}
      onClick={onNavigate}
      style={{ borderLeft: `2px solid ${stageColor}` }}
      title="⌘-click / Ctrl-click to toggle selection"
    >
      {healthColor && (
        <div
          className="absolute right-0 top-3 bottom-3 w-1 rounded-l"
          style={{ background: healthColor, opacity: 0.85 }}
          title={lead.deal_health_reason || `Deal health: ${lead.deal_health}`}
        />
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-1.5 min-w-0">
          {/* Drag handle */}
          <div
            {...dragHandleProps}
            className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-foreground leading-tight truncate">{lead.name}</p>
              {isOverdue && (
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Follow-up overdue" />
              )}
            </div>
            {lead.company && <p className="text-xs text-muted-foreground mt-0.5 truncate">{lead.company}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {(lead.fit_score != null || lead.intent_score != null) ? (
            <FitIntentPip fit={lead.fit_score} intent={lead.intent_score} />
          ) : (
            lead.ai_score != null && <AIScorePip score={lead.ai_score} />
          )}
        </div>
      </div>

      {lead.service_interest && (
        <p className="text-xs text-muted-foreground mb-2 truncate">{lead.service_interest}</p>
      )}

      {lead.tags && lead.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {lead.tags.slice(0, 4).map(t => (
            <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">#{t}</span>
          ))}
          {lead.tags.length > 4 && (
            <span className="text-[10px] text-muted-foreground/60">+{lead.tags.length - 4}</span>
          )}
        </div>
      )}

      {lead.active_sequence && (
        <p className="text-[11px] mb-2 flex items-center gap-1 text-primary"
           title={`Next step due ${new Date(lead.active_sequence.next_due_at).toLocaleString()}`}>
          <span className="inline-block w-1 h-1 rounded-full bg-primary animate-pulse" />
          ▶ {lead.active_sequence.name} · step {lead.active_sequence.current_step + 1}/{lead.active_sequence.total_steps}
        </p>
      )}

      {isOverdue && (
        <p className="text-xs mb-2" style={{ color: '#ef4444' }}>
          Follow-up: {new Date(lead.next_follow_up!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {lead.value && (
            <span className="text-xs font-mono text-muted-foreground">${lead.value.toLocaleString()}</span>
          )}
          {lead.budget_range && !lead.value && (
            <span className="text-xs text-muted-foreground/60">{lead.budget_range}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {stageIndex > 0 && (
            <button onClick={onMoveBack} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Move back">
              <ChevronLeft className="h-3 w-3" />
            </button>
          )}
          {stageIndex < totalStages - 1 && (
            <button onClick={onMoveForward} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Move forward">
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={onScore}
            disabled={scoring}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="AI score"
          >
            {scoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {lead.ai_notes && (
        <p className="text-xs mt-2 border-t border-border pt-2 line-clamp-2"
          style={{ color: '#C9A96E', opacity: 0.7 }}>
          {lead.ai_notes}
        </p>
      )}
    </div>
  )
}

function AIScorePip({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#C9A96E' : '#ef4444'
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-xs font-mono font-bold" style={{ color }}>{score}</span>
    </div>
  )
}

function FitIntentPip({ fit, intent }: { fit?: number; intent?: number }) {
  // Two stacked dots: fit (icp match) on top, intent (recent behavior) below.
  const c = (n: number | undefined) => n == null ? '#475569' : n >= 70 ? '#22c55e' : n >= 40 ? '#C9A96E' : '#ef4444'
  return (
    <div
      className="flex items-center gap-1 flex-shrink-0"
      title={`Fit: ${fit ?? '—'}  ·  Intent: ${intent ?? '—'}`}
    >
      <div className="flex flex-col gap-0.5">
        <div className="w-2 h-2 rounded-full" style={{ background: c(fit) }} />
        <div className="w-2 h-2 rounded-full" style={{ background: c(intent) }} />
      </div>
      <span className="text-xs font-mono font-bold" style={{ color: c(fit) }}>{fit ?? '—'}</span>
      <span className="text-xs font-mono text-muted-foreground">/</span>
      <span className="text-xs font-mono font-bold" style={{ color: c(intent) }}>{intent ?? '—'}</span>
    </div>
  )
}
