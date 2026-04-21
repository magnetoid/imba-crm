import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { buildCompanyContext, callAIText, getCRMRuntimeSettings } from '@/lib/ai'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

import toast from 'react-hot-toast'
import {
  FileText, Sparkles, Loader2, Plus, Trash2, Send, Eye,
  CheckCircle2, XCircle, Copy, Check, RefreshCw, DollarSign, Clock, FileCode,
} from 'lucide-react'
import { logActivity, interpolateTemplate, incrementTemplateUseCount } from './crm-utils'

interface Template { id: string; name: string; content: string }

interface CRMLead {
  id: string
  name: string
  email?: string
  company?: string
  service_interest?: string
  budget_range?: string
  notes?: string
  ai_score?: number
  ai_notes?: string
  stage: string
}

interface Proposal {
  id: string
  lead_id: string
  title: string
  content: string
  amount: number | null
  status: string
  valid_until: string | null
  sent_at: string | null
  signed_at: string | null
  ai_generated: boolean
  created_at: string
  updated_at: string
  crm_leads?: { name: string; company: string; email: string } | null
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Draft',    color: 'text-muted-foreground', bg: 'bg-muted/20' },
  sent:     { label: 'Sent',     color: 'text-blue-400', bg: 'bg-blue-500/10' },
  viewed:   { label: 'Viewed',   color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  signed:   { label: 'Signed',   color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  declined: { label: 'Declined', color: 'text-red-400', bg: 'bg-red-500/10' },
  expired:  { label: 'Expired',  color: 'text-muted-foreground/50', bg: 'bg-muted/10' },
}

export default function Proposals() {
    const [leads, setLeads] = useState<CRMLead[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [copied, setCopied] = useState<string | null>(null)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState('')
  const [proposalTitle, setProposalTitle] = useState('')
  const [proposalContent, setProposalContent] = useState('')
  const [proposalAmount, setProposalAmount] = useState('')
  const [proposalValidUntil, setProposalValidUntil] = useState('')
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')

  // View dialog
  const [viewProposal, setViewProposal] = useState<Proposal | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [leadsRes, proposalsRes, templatesRes] = await Promise.all([
      supabase.from('crm_leads').select('id,name,email,company,service_interest,budget_range,notes,ai_score,ai_notes,stage').order('created_at', { ascending: false }),
      supabase.from('crm_proposals').select('*, crm_leads(name,company,email)').order('created_at', { ascending: false }),
      supabase.from('crm_templates').select('id,name,content').eq('type', 'proposal').order('name'),
    ])
    setLeads((leadsRes.data as CRMLead[]) || [])
    setProposals((proposalsRes.data as Proposal[]) || [])
    setTemplates((templatesRes.data as Template[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function generateProposal() {
    if (!selectedLead) { toast.error('Select a lead first.'); return }
    const lead = leads.find(l => l.id === selectedLead)
    if (!lead) return

    setGenerating(true)
    try {
      const runtime = await getCRMRuntimeSettings()
      const text = await callAIText(`Create a professional video production proposal for Imba Production.
${buildCompanyContext(runtime)}

Client info:
- Name: ${lead.name}
- Company: ${lead.company || 'unknown'}
- Service needed: ${lead.service_interest || 'video production'}
- Budget: ${lead.budget_range || 'to be determined'}
- Notes: ${lead.notes || 'none'}
- AI assessment: ${lead.ai_notes || 'none'}

Write a polished proposal in markdown with sections: Executive Summary, Project Scope, Deliverables, Timeline, Investment, Why Imba, Next Steps.
Start with a line formatted exactly as "Title: ..." and include a line formatted exactly as "Estimated Amount: 12000".
Keep it under 600 words.`, { maxTokens: 1800 })

      const titleMatch = text.match(/Title:\s*(.+)/i)
      const amountMatch = text.match(/Estimated Amount:\s*\$?([\d,]+)/i)
      setProposalTitle(titleMatch?.[1]?.trim() || `Proposal for ${lead.company || lead.name}`)
      setProposalContent(text.replace(/Title:\s*.+/i, '').replace(/Estimated Amount:\s*\$?[\d,]+/i, '').trim())
      if (amountMatch?.[1]) setProposalAmount(amountMatch[1].replace(/,/g, ''))
      toast.success('Proposal generated — review and save')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation failed')
    }
    setGenerating(false)
  }

  async function saveProposal() {
    if (!selectedLead || !proposalTitle || !proposalContent) return
    setSaving(true)
    const { error } = await supabase.from('crm_proposals').insert({
      lead_id: selectedLead,
      title: proposalTitle,
      content: proposalContent,
      amount: proposalAmount ? parseFloat(proposalAmount) : null,
      valid_until: proposalValidUntil || null,
      ai_generated: generating,
      status: 'draft',
    })
    setSaving(false)
    if (error) { toast.error(error.message || 'Failed to save'); return }
    toast.success('Proposal saved as draft')
    logActivity(selectedLead, 'proposal', `Proposal created: ${proposalTitle}`, proposalAmount ? `$${Number(proposalAmount).toLocaleString()}` : '')
    setCreateOpen(false)
    resetForm()
    load()
  }

  function resetForm() {
    setSelectedLead('')
    setProposalTitle('')
    setProposalContent('')
    setProposalAmount('')
    setProposalValidUntil('')
    setSelectedTemplate('')
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplate(templateId)
    if (!templateId) return
    const template = templates.find(t => t.id === templateId)
    if (!template) return
    const lead = leads.find(l => l.id === selectedLead)
    if (lead) {
      setProposalContent(interpolateTemplate(template.content, lead))
      if (!proposalTitle) setProposalTitle(`${template.name} — ${lead.company || lead.name}`)
    } else {
      setProposalContent(template.content)
      if (!proposalTitle) setProposalTitle(template.name)
    }
    incrementTemplateUseCount(templateId).catch(() => {})
  }

  async function updateStatus(id: string, status: string, extra?: Record<string, unknown>) {
    await supabase.from('crm_proposals').update({ status, ...extra }).eq('id', id)
    setProposals(prev => prev.map(p => p.id === id ? { ...p, status, ...extra } as Proposal : p))
    toast.success(`Marked as ${status}`)

    // Log activity + auto-move lead to won on signed
    const proposal = proposals.find(p => p.id === id)
    if (!proposal) return
    logActivity(proposal.lead_id, 'proposal', `Proposal ${status}: ${proposal.title}`)

    if (status === 'signed') {
      const { data: settings } = await supabase.from('crm_runtime_settings').select('auto_won_on_proposal_signed').eq('id', 1).maybeSingle()
      if (settings?.auto_won_on_proposal_signed !== false) {
        await supabase.from('crm_leads').update({ stage: 'won', value: proposal.amount }).eq('id', proposal.lead_id)
        logActivity(proposal.lead_id, 'note', 'Lead auto-moved to Won (proposal signed)')
        toast.success('Lead auto-moved to Won')
      }
    }
  }

  async function deleteProposal(id: string) {
    if (!confirm('Delete this proposal?')) return
    await supabase.from('crm_proposals').delete().eq('id', id)
    setProposals(prev => prev.filter(p => p.id !== id))
    toast.success('Deleted')
  }

  function copyContent(p: Proposal) {
    navigator.clipboard.writeText(p.content)
    setCopied(p.id)
    setTimeout(() => setCopied(null), 2000)
  }

  const filtered = statusFilter === 'all' ? proposals : proposals.filter(p => p.status === statusFilter)
  const totalValue = proposals.filter(p => p.status === 'signed').reduce((s, p) => s + (p.amount || 0), 0)
  const pendingValue = proposals.filter(p => ['sent', 'viewed'].includes(p.status)).reduce((s, p) => s + (p.amount || 0), 0)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-amber-500" />
          <h1 className="text-2xl font-semibold">Proposals</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="gap-2 bg-amber-500 hover:bg-amber-600 text-black" onClick={() => { resetForm(); setCreateOpen(true) }}>
            <Plus className="h-4 w-4" /> New proposal
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-sm mb-8">Generate AI proposals, track status, and close deals faster.</p>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total', value: proposals.length, icon: FileText },
          { label: 'Pending', value: proposals.filter(p => ['sent', 'viewed'].includes(p.status)).length, icon: Clock, extra: pendingValue ? `$${pendingValue.toLocaleString()}` : undefined },
          { label: 'Signed', value: proposals.filter(p => p.status === 'signed').length, icon: CheckCircle2, extra: totalValue ? `$${totalValue.toLocaleString()}` : undefined },
          { label: 'Win rate', value: proposals.length > 0 ? `${Math.round((proposals.filter(p => p.status === 'signed').length / proposals.filter(p => !['draft'].includes(p.status)).length) * 100) || 0}%` : '—', icon: DollarSign },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-2xl font-mono font-bold text-foreground">{s.value}</p>
            {s.extra && <p className="text-xs text-amber-500 font-mono mt-0.5">{s.extra}</p>}
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {['all', ...Object.keys(STATUS_META)].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${statusFilter === s ? 'bg-amber-500/15 text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}>
            {s === 'all' ? `All (${proposals.length})` : `${STATUS_META[s]?.label || s} (${proposals.filter(p => p.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Proposal list */}
      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No proposals yet. Create one with AI or manually.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(proposal => {
            const meta = STATUS_META[proposal.status] || STATUS_META.draft
            return (
              <div key={proposal.id} className="bg-card border border-border rounded-lg p-5 hover:border-border/60 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium">{proposal.title}</span>
                      {proposal.ai_generated && (
                        <Badge variant="secondary" className="text-xs gap-1 py-0 h-5">
                          <Sparkles className="h-2.5 w-2.5" /> AI
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {proposal.crm_leads?.company || proposal.crm_leads?.name || '—'}
                      {proposal.crm_leads?.email && <span className="ml-2">{proposal.crm_leads.email}</span>}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {proposal.amount && <span className="font-mono font-medium text-foreground">${proposal.amount.toLocaleString()}</span>}
                      {proposal.valid_until && <span>Valid until {new Date(proposal.valid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                      <span>{new Date(proposal.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-mono flex-shrink-0 px-2 py-0.5 rounded ${meta.bg} ${meta.color}`}>{meta.label}</span>
                </div>

                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border flex-wrap">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setViewProposal(proposal)}>
                    <Eye className="h-3 w-3" /> View
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => copyContent(proposal)}>
                    {copied === proposal.id ? <><Check className="h-3 w-3 text-emerald-400" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                  </Button>
                  {proposal.status === 'draft' && (
                    <Button size="sm" className="h-7 text-xs gap-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20"
                      onClick={() => updateStatus(proposal.id, 'sent', { sent_at: new Date().toISOString() })}>
                      <Send className="h-3 w-3" /> Mark sent
                    </Button>
                  )}
                  {proposal.status === 'sent' && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-cyan-400"
                      onClick={() => updateStatus(proposal.id, 'viewed')}>
                      <Eye className="h-3 w-3" /> Mark viewed
                    </Button>
                  )}
                  {['sent', 'viewed'].includes(proposal.status) && (
                    <>
                      <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                        onClick={() => updateStatus(proposal.id, 'signed', { signed_at: new Date().toISOString() })}>
                        <CheckCircle2 className="h-3 w-3" /> Signed
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-red-400"
                        onClick={() => updateStatus(proposal.id, 'declined')}>
                        <XCircle className="h-3 w-3" /> Declined
                      </Button>
                    </>
                  )}
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteProposal(proposal.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create proposal dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create proposal</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Lead *</Label>
                <Select value={selectedLead} onValueChange={setSelectedLead}>
                  <SelectTrigger><SelectValue placeholder="Select lead" /></SelectTrigger>
                  <SelectContent>
                    {leads.filter(l => !['won', 'lost'].includes(l.stage)).map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.company || l.name} — {l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Amount ($)</Label>
                <Input type="number" value={proposalAmount} onChange={e => setProposalAmount(e.target.value)} placeholder="10000" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-end">
              {selectedLead && (
                <Button variant="outline" onClick={generateProposal} disabled={generating} className="gap-2">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-500" />}
                  Generate with AI
                </Button>
              )}
              {templates.length > 0 && (
                <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                  <Label className="flex items-center gap-1.5 text-xs"><FileCode className="h-3 w-3 text-amber-500" /> Or start from template</Label>
                  <Select value={selectedTemplate} onValueChange={applyTemplate}>
                    <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                    <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Title *</Label>
              <Input value={proposalTitle} onChange={e => setProposalTitle(e.target.value)} placeholder="Video Production Proposal for…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Proposal content * (markdown)</Label>
              <Textarea value={proposalContent} onChange={e => setProposalContent(e.target.value)} rows={16} className="font-mono text-sm" placeholder="Write your proposal or generate with AI…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Valid until</Label>
              <Input type="date" value={proposalValidUntil} onChange={e => setProposalValidUntil(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={saveProposal} disabled={saving || !selectedLead || !proposalTitle || !proposalContent}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save as draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View proposal dialog */}
      <Dialog open={!!viewProposal} onOpenChange={open => !open && setViewProposal(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewProposal?.title}</DialogTitle>
          </DialogHeader>
          {viewProposal && (
            <div className="py-2">
              <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
                <span>{viewProposal.crm_leads?.company || viewProposal.crm_leads?.name}</span>
                {viewProposal.amount && <span className="font-mono font-medium text-foreground">${viewProposal.amount.toLocaleString()}</span>}
                <Badge variant="outline" className={`${STATUS_META[viewProposal.status]?.color || ''}`}>
                  {STATUS_META[viewProposal.status]?.label || viewProposal.status}
                </Badge>
              </div>
              <div className="bg-muted/20 border border-border rounded-lg p-6 prose prose-sm dark:prose-invert max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{viewProposal.content}</pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (viewProposal) copyContent(viewProposal) }} className="gap-1">
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button onClick={() => setViewProposal(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
