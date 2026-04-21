import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { buildCompanyContext, callAIJSON, callAIText, getCRMRuntimeSettings } from '@/lib/ai'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Loader2, Sparkles, Plus, Trash2, Mail, Phone, Globe, Building, Check, Copy, FileText, Calendar, Zap } from 'lucide-react'
import { enrichLeadFromWebsite, logActivity } from './crm-utils'
import toast from 'react-hot-toast'
import { STAGES } from './CRMDashboard'
import type { CRMLead } from './CRMDashboard'

interface Activity {
  id: string
  lead_id: string
  type: string
  subject?: string
  body: string
  created_by: string
  created_at: string
}

const ACTIVITY_TYPES = ['note', 'email', 'call', 'meeting', 'proposal', 'follow_up']
const ACTIVITY_ICONS: Record<string, string> = {
  note: '📝', email: '✉️', call: '📞', meeting: '🤝', proposal: '📄', follow_up: '🔔',
}
const CONTACT_TYPES = new Set(['email', 'call', 'meeting'])

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [lead, setLead] = useState<CRMLead | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiTemplate, setAiTemplate] = useState('')
  const [aiProposal, setAiProposal] = useState('')
  const [aiTab, setAiTab] = useState<'email' | 'proposal'>('email')
  const [copied, setCopied] = useState(false)
  const [newActivity, setNewActivity] = useState({ type: 'note', subject: '', body: '' })
  const [addingActivity, setAddingActivity] = useState(false)
  const [deletingActivity, setDeletingActivity] = useState<string | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [outreachEmails, setOutreachEmails] = useState<Array<{ id: string; subject: string; status: string; sent_at: string | null; created_at: string }>>([])
  const [leadProposals, setLeadProposals] = useState<Array<{ id: string; title: string; amount: number | null; status: string; sent_at: string | null; signed_at: string | null; created_at: string }>>([])
  const [leadInvoices, setLeadInvoices] = useState<Array<{ id: string; invoice_number: string; total: number; status: string; paid_at: string | null; created_at: string }>>([])

  const loadAll = useCallback(async () => {
    if (!id) return
    const [leadRes, activitiesRes, emailsRes, proposalsRes, invoicesRes] = await Promise.all([
      supabase.from('crm_leads').select('*').eq('id', id).single(),
      supabase.from('crm_activities').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
      supabase.from('crm_outreach_emails').select('id,subject,status,sent_at,created_at').eq('lead_id', id).order('created_at', { ascending: false }),
      supabase.from('crm_proposals').select('id,title,amount,status,sent_at,signed_at,created_at').eq('lead_id', id).order('created_at', { ascending: false }),
      supabase.from('crm_invoices').select('id,invoice_number,total,status,paid_at,created_at').eq('lead_id', id).order('created_at', { ascending: false }),
    ])
    setLead(leadRes.data)
    setActivities(activitiesRes.data || [])
    setOutreachEmails(emailsRes.data || [])
    setLeadProposals(proposalsRes.data || [])
    setLeadInvoices(invoicesRes.data || [])
    setLoading(false)
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  async function saveField(field: string, value: unknown) {
    if (!lead) return
    setSaving(true)
    await supabase.from('crm_leads').update({ [field]: value }).eq('id', lead.id)
    setLead(l => l ? { ...l, [field]: value } : l)
    setSaving(false)
  }

  async function addActivity(e: React.FormEvent) {
    e.preventDefault()
    if (!newActivity.body.trim() || !id || !lead) return
    setAddingActivity(true)
    const updates: Record<string, unknown> = {}
    if (CONTACT_TYPES.has(newActivity.type)) {
      updates.last_contacted_at = new Date().toISOString()
    }
    await supabase.from('crm_activities').insert([{
      lead_id: id,
      type: newActivity.type,
      subject: newActivity.subject || null,
      body: newActivity.body,
    }])
    if (Object.keys(updates).length > 0) {
      await supabase.from('crm_leads').update(updates).eq('id', lead.id)
      setLead(l => l ? { ...l, ...updates } : l)
    }
    setNewActivity({ type: 'note', subject: '', body: '' })
    setAddingActivity(false)
    loadAll()
  }

  async function deleteActivity(activityId: string) {
    setDeletingActivity(activityId)
    await supabase.from('crm_activities').delete().eq('id', activityId)
    setActivities(a => a.filter(x => x.id !== activityId))
    setDeletingActivity(null)
  }

  async function generateEmailTemplate() {
    if (!lead) return
    setAiLoading(true)
    setAiTemplate('')
    try {
      const runtime = await getCRMRuntimeSettings()
      const text = await callAIText(`Write a short, warm, professional follow-up email for Imba Production.
${buildCompanyContext(runtime)}

Lead info:
- Name: ${lead.name}
- Company: ${lead.company || 'unknown company'}
- Service interest: ${lead.service_interest || 'video production'}
- Budget: ${lead.budget_range || 'unknown'}
- Stage: ${lead.stage}
- Notes: ${lead.notes || 'none'}
- AI score: ${lead.ai_score ?? 'not scored'}
- AI notes: ${lead.ai_notes || 'none'}

Write a natural follow-up email. Subject line first, then body. Keep it under 150 words.`, { maxTokens: 600 })
      setAiTemplate(text)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate email')
      setAiTemplate('Failed to generate email.')
    }
    setAiLoading(false)
  }

  async function generateProposal() {
    if (!lead) return
    setAiLoading(true)
    setAiProposal('')
    try {
      const runtime = await getCRMRuntimeSettings()
      const text = await callAIText(`Create a concise video production proposal outline for Imba Production.
${buildCompanyContext(runtime)}

Client info:
- Name: ${lead.name}
- Company: ${lead.company || 'unknown company'}
- Service needed: ${lead.service_interest || 'video production'}
- Budget: ${lead.budget_range || 'unknown'}
- Notes: ${lead.notes || 'none'}
- Stage: ${lead.stage}

Format as a proposal outline with sections: Executive Summary, Project Scope, Deliverables, Timeline, Investment, and Next Steps. Keep each section brief.`, { maxTokens: 900 })
      setAiProposal(text)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate proposal')
      setAiProposal('Failed to generate proposal.')
    }
    setAiLoading(false)
  }

  async function scoreWithAI() {
    if (!lead) return
    setAiLoading(true)
    try {
      const runtime = await getCRMRuntimeSettings()
      const parsed = await callAIJSON<{ score: number; notes: string }>(`Score this lead for Imba Production from 0-100 and give a concise follow-up recommendation.
${buildCompanyContext(runtime)}

Lead: ${lead.name}, ${lead.company || 'no company'}, ${lead.service_interest || 'unknown service'}, budget: ${lead.budget_range || 'unknown'}, stage: ${lead.stage}, notes: ${lead.notes || 'none'}

Return ONLY valid JSON: {"score": NUMBER, "notes": "recommendation"}`, { maxTokens: 400 })
      await supabase.from('crm_leads').update({ ai_score: parsed.score, ai_notes: parsed.notes, last_ai_scored_at: new Date().toISOString() }).eq('id', lead.id)
      setLead(l => l ? { ...l, ai_score: parsed.score, ai_notes: parsed.notes } : l)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI scoring failed')
    }
    setAiLoading(false)
  }

  async function enrichLead() {
    if (!lead) return
    if (!lead.website) { toast.error('Add a website URL first.'); return }
    setEnriching(true)
    try {
      const result = await enrichLeadFromWebsite(lead.website, lead.company)
      if (!result) { toast.error('Enrichment failed.'); setEnriching(false); return }
      const enrichedNotes = `[Enriched ${new Date().toLocaleDateString()}]\nIndustry: ${result.industry}\nSize: ${result.company_size}\nNeeds: ${result.likely_needs}\n\n${lead.notes || ''}`.trim()
      await supabase.from('crm_leads').update({
        service_interest: lead.service_interest || result.industry,
        notes: enrichedNotes,
        ai_notes: result.ai_summary,
      }).eq('id', lead.id)
      setLead(l => l ? { ...l, service_interest: l.service_interest || result.industry, notes: enrichedNotes, ai_notes: result.ai_summary } : l)
      logActivity(lead.id, 'note', 'Lead enriched from website', result.ai_summary)
      toast.success('Lead enriched with AI insights')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enrichment failed')
    }
    setEnriching(false)
  }

  async function deleteLead() {
    if (!lead || !confirm(`Delete lead "${lead.name}"?`)) return
    await supabase.from('crm_leads').delete().eq('id', lead.id)
    navigate('/admin/crm')
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  if (!lead) return (
    <div className="p-8">
      <p className="text-muted-foreground">Lead not found.</p>
      <Button variant="ghost" onClick={() => navigate('/admin/crm')} className="mt-4">
        <ArrowLeft className="h-4 w-4 mr-2" />Back to CRM
      </Button>
    </div>
  )

  const stageInfo = STAGES.find(s => s.key === lead.stage)
  const stageIndex = STAGES.findIndex(s => s.key === lead.stage)
  const isOverdue = lead.next_follow_up && new Date(lead.next_follow_up) < new Date() && !['won', 'lost'].includes(lead.stage)

  const aiContent = aiTab === 'email' ? aiTemplate : aiProposal

  return (
    <div className="p-6 max-w-screen-lg">
      {/* Back + delete */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/crm')}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back to pipeline
        </Button>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {lead.website && (
            <Button variant="outline" size="sm" onClick={enrichLead} disabled={enriching}>
              {enriching ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5 text-amber-500" />}
              Enrich with AI
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={deleteLead}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
          </Button>
        </div>
      </div>

      {/* Stage stepper */}
      <div className="flex items-center gap-0 mb-6 overflow-x-auto pb-1">
        {STAGES.map((s, i) => {
          const isPast = i < stageIndex
          const isCurrent = i === stageIndex
          return (
            <button
              key={s.key}
              onClick={() => saveField('stage', s.key)}
              className="flex items-center group"
            >
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all ${
                isCurrent ? 'text-white' : isPast ? 'text-muted-foreground' : 'text-muted-foreground/40'
              }`}
                style={isCurrent ? { background: s.color } : isPast ? { background: `${s.color}20` } : {}}
              >
                {isPast && <Check className="h-3 w-3" />}
                {s.label}
              </div>
              {i < STAGES.length - 1 && (
                <div className={`h-px w-3 flex-shrink-0 ${i < stageIndex ? 'bg-border' : 'bg-border/30'}`} />
              )}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Lead info */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Header card */}
          <div className="border border-border rounded-lg p-5" style={{ borderLeft: `3px solid ${stageInfo?.color || '#6C7AE0'}` }}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-semibold text-foreground">{lead.name}</h1>
                {lead.company && <p className="text-muted-foreground mt-1 flex items-center gap-1.5"><Building className="h-3.5 w-3.5" />{lead.company}</p>}
              </div>
              <Select value={lead.stage} onValueChange={v => saveField('stage', v)}>
                <SelectTrigger className="w-[160px]" style={{ borderColor: `${stageInfo?.color}40`, color: stageInfo?.color }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                  <Mail className="h-3.5 w-3.5" />{lead.email}
                </a>
              )}
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                  <Phone className="h-3.5 w-3.5" />{lead.phone}
                </a>
              )}
              {lead.website && (
                <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                  <Globe className="h-3.5 w-3.5" />{lead.website}
                </a>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Lead details</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Service interest', field: 'service_interest', value: lead.service_interest },
                { label: 'Budget range', field: 'budget_range', value: lead.budget_range },
                { label: 'Deal value ($)', field: 'value', value: lead.value?.toString() },
                { label: 'Probability (%)', field: 'probability', value: lead.probability.toString() },
              ].map(({ label, field, value }) => (
                <div key={field} className="flex flex-col gap-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    defaultValue={value || ''}
                    onBlur={e => saveField(field, field === 'value' ? (parseFloat(e.target.value) || null) : (field === 'probability' ? parseInt(e.target.value) : e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>

            {/* Follow-up date */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <Label className={`text-xs flex items-center gap-1.5 ${isOverdue ? 'text-red-400' : ''}`}>
                  <Calendar className="h-3 w-3" />
                  Next follow-up {isOverdue && <span className="text-red-400">— overdue!</span>}
                </Label>
                <Input
                  type="date"
                  defaultValue={lead.next_follow_up ? lead.next_follow_up.split('T')[0] : ''}
                  onBlur={e => saveField('next_follow_up', e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className={`h-8 text-sm ${isOverdue ? 'border-red-400/50 text-red-400' : ''}`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Last contacted</Label>
                <Input
                  type="date"
                  defaultValue={lead.last_contacted_at ? lead.last_contacted_at.split('T')[0] : ''}
                  onBlur={e => saveField('last_contacted_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="mt-4">
              <Label className="text-xs">Notes</Label>
              <Textarea
                defaultValue={lead.notes || ''}
                onBlur={e => saveField('notes', e.target.value)}
                rows={3}
                className="mt-1 text-sm"
                placeholder="Internal notes about this lead…"
              />
            </div>
          </div>

          {/* Journey funnel — multi-touch attribution */}
          <div className="border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Lead journey</h3>
            <LeadJourney
              createdAt={lead.created_at}
              aiScored={lead.ai_score != null}
              emails={outreachEmails}
              proposals={leadProposals}
              invoices={leadInvoices}
              stage={lead.stage}
            />
          </div>

          {/* Activity timeline */}
          <div className="border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Activity timeline</h3>
            <form onSubmit={addActivity} className="flex flex-col gap-3 mb-5">
              <div className="flex gap-2">
                <Select value={newActivity.type} onValueChange={v => setNewActivity(a => ({ ...a, type: v }))}>
                  <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{ACTIVITY_ICONS[t]} {t.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={newActivity.subject}
                  onChange={e => setNewActivity(a => ({ ...a, subject: e.target.value }))}
                  placeholder="Subject (optional)"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={newActivity.body}
                  onChange={e => setNewActivity(a => ({ ...a, body: e.target.value }))}
                  placeholder="Log a note, email, call…"
                  rows={2}
                  className="text-sm"
                />
                <Button type="submit" size="sm" disabled={addingActivity} className="self-end">
                  {addingActivity ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {CONTACT_TYPES.has(newActivity.type) && (
                <p className="text-xs text-muted-foreground/60">Logging this will update "Last contacted" to now.</p>
              )}
            </form>

            <div className="flex flex-col gap-3">
              {activities.map(a => (
                <div key={a.id} className="flex gap-3 group/activity">
                  <div className="text-base mt-0.5 flex-shrink-0">{ACTIVITY_ICONS[a.type] || '📝'}</div>
                  <div className="flex-1 min-w-0">
                    {a.subject && <p className="text-sm font-medium text-foreground">{a.subject}</p>}
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.body}</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">
                      {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteActivity(a.id)}
                    disabled={deletingActivity === a.id}
                    className="flex-shrink-0 opacity-0 group-hover/activity:opacity-100 transition-opacity p-1 text-muted-foreground/40 hover:text-destructive"
                    title="Delete"
                  >
                    {deletingActivity === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </button>
                </div>
              ))}
              {activities.length === 0 && (
                <p className="text-xs text-muted-foreground/50 text-center py-4">No activities yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: AI sidebar */}
        <div className="flex flex-col gap-5">
          {/* AI Score */}
          <div className="border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground">AI Lead Score</h3>
              <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                style={{ background: 'rgba(201,169,110,0.1)', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.2)' }}>
                Claude
              </span>
            </div>
            {lead.ai_score != null ? (
              <div className="mb-3">
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-4xl font-bold" style={{ color: lead.ai_score >= 70 ? '#22c55e' : lead.ai_score >= 40 ? '#C9A96E' : '#ef4444' }}>
                    {lead.ai_score}
                  </span>
                  <span className="text-muted-foreground text-sm mb-1">/100</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${lead.ai_score}%`,
                      background: lead.ai_score >= 70 ? '#22c55e' : lead.ai_score >= 40 ? '#C9A96E' : '#ef4444',
                    }} />
                </div>
                {lead.ai_notes && <p className="text-xs text-muted-foreground leading-relaxed">{lead.ai_notes}</p>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mb-3">Not scored yet. Click below to analyse this lead with AI.</p>
            )}
            <Button variant="outline" size="sm" className="w-full" onClick={scoreWithAI} disabled={aiLoading}>
              {aiLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Analysing…</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Score with AI</>}
            </Button>
            <p className="text-xs text-muted-foreground/50 mt-2 text-center">Uses the server-side AI proxy configured in CRM Settings</p>
          </div>

          {/* AI Generator — email + proposal tabs */}
          <div className="border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground">AI Generator</h3>
              <div className="flex border border-border rounded overflow-hidden">
                {([
                  { key: 'email', icon: Mail, label: 'Email' },
                  { key: 'proposal', icon: FileText, label: 'Proposal' },
                ] as const).map(({ key, icon: Icon, label }) => (
                  <button key={key} onClick={() => setAiTab(key)}
                    className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${aiTab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Icon className="h-3 w-3" />{label}
                  </button>
                ))}
              </div>
            </div>

            {aiContent && (
              <div className="bg-muted/30 border border-border rounded p-3 mb-3 relative">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-60 overflow-y-auto">{aiContent}</pre>
                <button
                  onClick={() => copyToClipboard(aiContent)}
                  className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? <><Check className="h-3 w-3 text-green-500" />Copied!</> : <><Copy className="h-3 w-3" />Copy</>}
                </button>
              </div>
            )}

            <Button variant="outline" size="sm" className="w-full" disabled={aiLoading}
              onClick={aiTab === 'email' ? generateEmailTemplate : generateProposal}>
              {aiLoading
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generating…</>
                : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />{aiTab === 'email' ? 'Generate email' : 'Generate proposal'}</>}
            </Button>
          </div>

          {/* Meta */}
          <div className="border border-border rounded-lg p-4">
            <p className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-3">Meta</p>
            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Source</span>
                <Badge variant="outline" className="text-[0.65rem]">{lead.source.replace(/_/g, ' ')}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Probability</span>
                <span className="text-foreground font-mono">{lead.probability}%</span>
              </div>
              {lead.value && (
                <div className="flex justify-between">
                  <span>Deal value</span>
                  <span className="text-foreground font-mono">${lead.value.toLocaleString()}</span>
                </div>
              )}
              {lead.last_contacted_at && (
                <div className="flex justify-between">
                  <span>Last contacted</span>
                  <span>{new Date(lead.last_contacted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span>Created</span>
                <span>{new Date(lead.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Multi-touch attribution funnel
// ─────────────────────────────────────────────────────────
interface JourneyProps {
  createdAt: string
  aiScored: boolean
  emails: Array<{ id: string; subject: string; status: string; sent_at: string | null; created_at: string }>
  proposals: Array<{ id: string; title: string; amount: number | null; status: string; sent_at: string | null; signed_at: string | null; created_at: string }>
  invoices: Array<{ id: string; invoice_number: string; total: number; status: string; paid_at: string | null; created_at: string }>
  stage: string
}

function LeadJourney({ createdAt, aiScored, emails, proposals, invoices, stage }: JourneyProps) {
  const emailsSent = emails.filter(e => ['sent', 'opened', 'replied'].includes(e.status)).length
  const emailsOpened = emails.filter(e => ['opened', 'replied'].includes(e.status)).length
  const emailsReplied = emails.filter(e => e.status === 'replied').length
  const proposalsSent = proposals.filter(p => p.status !== 'draft').length
  const proposalsSigned = proposals.filter(p => p.status === 'signed').length
  const invoicePaid = invoices.filter(i => i.status === 'paid').length > 0
  const invoiceTotal = invoices.reduce((s, i) => s + (i.total || 0), 0)

  const steps = [
    { key: 'created', label: 'Lead created', done: true, color: '#6C7AE0', detail: new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
    { key: 'scored', label: 'AI scored', done: aiScored, color: '#C9A96E', detail: aiScored ? 'analyzed' : 'pending' },
    { key: 'emailed', label: 'Emailed', done: emailsSent > 0, color: '#3CBFAE', detail: emailsSent > 0 ? `${emailsSent} sent` : 'not yet' },
    { key: 'opened', label: 'Opened', done: emailsOpened > 0, color: '#00D4FF', detail: emailsOpened > 0 ? `${emailsOpened} opened` : '—' },
    { key: 'replied', label: 'Replied', done: emailsReplied > 0, color: '#8A8AFF', detail: emailsReplied > 0 ? `${emailsReplied} replies` : '—' },
    { key: 'proposal', label: 'Proposal', done: proposalsSent > 0, color: '#E87A2A', detail: proposalsSent > 0 ? `${proposalsSent} sent` : 'not yet' },
    { key: 'signed', label: 'Signed', done: proposalsSigned > 0, color: '#22c55e', detail: proposalsSigned > 0 ? `${proposalsSigned} signed` : '—' },
    { key: 'won', label: 'Won', done: stage === 'won', color: '#22c55e', detail: stage === 'won' ? 'closed' : '—' },
    { key: 'paid', label: 'Paid', done: invoicePaid, color: '#22c55e', detail: invoicePaid ? `$${invoiceTotal.toLocaleString()}` : invoices.length > 0 ? `${invoices.length} pending` : '—' },
  ]

  const doneCount = steps.filter(s => s.done).length
  const progress = Math.round((doneCount / steps.length) * 100)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">Full attribution — from lead capture to paid invoice</p>
        <span className="text-xs font-mono text-muted-foreground">{progress}% complete</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden mb-5">
        <div className="h-full bg-gradient-to-r from-primary to-amber-500 transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {steps.map((step, i) => (
          <div key={step.key} className="flex flex-col items-center text-center relative">
            {i > 0 && (
              <div className="absolute top-3 -left-1/2 w-full h-px" style={{ background: step.done ? step.color : 'rgba(255,255,255,0.1)' }} />
            )}
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold z-10 transition-all ${step.done ? 'text-white' : 'text-muted-foreground/50'}`}
              style={{
                background: step.done ? step.color : 'rgba(255,255,255,0.05)',
                border: step.done ? `1px solid ${step.color}` : '1px solid rgba(255,255,255,0.1)',
                boxShadow: step.done ? `0 0 12px ${step.color}40` : 'none',
              }}
            >
              {step.done ? '✓' : i + 1}
            </div>
            <p className={`text-[9px] font-mono uppercase tracking-wider mt-1.5 ${step.done ? 'text-foreground' : 'text-muted-foreground/40'}`}>{step.label}</p>
            <p className={`text-[9px] ${step.done ? 'text-muted-foreground' : 'text-muted-foreground/30'}`}>{step.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
