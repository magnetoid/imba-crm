import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Badge } from '@imba/shared/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@imba/shared/ui/dialog'
import { Label } from '@imba/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@imba/shared/ui/select'
import toast from 'react-hot-toast'
import {
  Radar, Plus, Loader2, Trash2, ExternalLink, Globe, Search,
  Sparkles, TrendingUp, AlertCircle, CheckCircle,
  Video, Eye, Zap, RefreshCw,
} from 'lucide-react'
import {
  type SiteAnalysis,
  listAnalyses,
  analyzeSite,
  deleteAnalysis,
  scoreColor,
  extractDomain,
} from './lib/analyzer'

// ─── Score gauge mini component ──────────────────────────────────────────────

function ScoreGauge({ score, label, size = 'md' }: { score: number | null; label: string; size?: 'sm' | 'md' }) {
  const radius = size === 'sm' ? 18 : 24
  const stroke = size === 'sm' ? 3 : 4
  const circumference = 2 * Math.PI * radius
  const offset = circumference - ((score ?? 0) / 100) * circumference
  const dim = (radius + stroke) * 2

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} className="-rotate-90">
          <circle
            cx={radius + stroke} cy={radius + stroke} r={radius}
            fill="none" strokeWidth={stroke}
            className="stroke-muted/30"
          />
          <circle
            cx={radius + stroke} cy={radius + stroke} r={radius}
            fill="none" strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={`transition-all duration-700 ${
              score === null ? 'stroke-muted' :
              score >= 80 ? 'stroke-emerald-500' :
              score >= 60 ? 'stroke-amber-500' :
              score >= 40 ? 'stroke-orange-500' : 'stroke-red-500'
            }`}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center font-mono font-bold ${
          size === 'sm' ? 'text-[0.6rem]' : 'text-xs'
        } ${scoreColor(score)}`}>
          {score ?? '—'}
        </span>
      </div>
      <span className="text-[0.6rem] text-muted-foreground font-mono uppercase tracking-wider">{label}</span>
    </div>
  )
}

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SiteAnalysis['status'] }) {
  const config = {
    pending: { label: 'Pending', cls: 'bg-muted text-muted-foreground', icon: Loader2 },
    crawling: { label: 'Crawling', cls: 'bg-blue-500/10 text-blue-400', icon: Globe },
    analyzing: { label: 'Analyzing', cls: 'bg-purple-500/10 text-purple-400', icon: Sparkles },
    complete: { label: 'Complete', cls: 'bg-emerald-500/10 text-emerald-400', icon: CheckCircle },
    failed: { label: 'Failed', cls: 'bg-red-500/10 text-red-400', icon: AlertCircle },
  }[status]

  const Icon = config.icon

  return (
    <Badge variant="outline" className={`text-xs gap-1 border-0 ${config.cls}`}>
      <Icon className={`h-3 w-3 ${status === 'crawling' || status === 'analyzing' ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SiteAnalyzer() {
  const navigate = useNavigate()
  const [analyses, setAnalyses] = useState<SiteAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [selectedLead, setSelectedLead] = useState<string>('')
  const [leads, setLeads] = useState<{ id: string; name: string; company: string; website: string }[]>([])
  const [statusMsg, setStatusMsg] = useState('')
  const [filter, setFilter] = useState<'all' | 'complete' | 'failed' | 'pending'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  async function load() {
    setLoading(true)
    const data = await listAnalyses()
    setAnalyses(data)
    setLoading(false)
  }

  async function loadLeads() {
    const { data } = await supabase
      .from('crm_leads')
      .select('id, name, company, website')
      .not('website', 'is', null)
      .neq('website', '')
      .order('company')
      .limit(200)
    setLeads(data || [])
  }

  useEffect(() => { load() }, [])

  function openDialog() {
    setUrl('')
    setSelectedLead('')
    setStatusMsg('')
    loadLeads()
    setDialogOpen(true)
  }

  function handleLeadSelect(leadId: string) {
    setSelectedLead(leadId)
    const lead = leads.find(l => l.id === leadId)
    if (lead?.website) {
      setUrl(lead.website)
    }
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) { toast.error('Enter a URL'); return }

    setAnalyzing(true)
    setStatusMsg('Starting analysis…')

    const result = await analyzeSite(url, {
      leadId: selectedLead || undefined,
      onStatusChange: (status, detail) => setStatusMsg(detail || status),
    })

    setAnalyzing(false)
    setDialogOpen(false)

    if (result) {
      toast.success(`Analysis complete: ${result.domain} scored ${result.score_overall}/100`)
      load()
    } else {
      toast.error('Analysis failed — check the domain and try again')
      load()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this analysis?')) return
    const ok = await deleteAnalysis(id)
    if (ok) {
      toast.success('Analysis deleted')
      load()
    } else {
      toast.error('Failed to delete')
    }
  }

  async function handleBatchAnalyze() {
    const leadsWithoutAnalysis = leads.filter(l =>
      l.website && !analyses.some(a => extractDomain(a.url) === extractDomain(l.website))
    ).slice(0, 10)

    if (leadsWithoutAnalysis.length === 0) {
      toast('All leads with websites have been analyzed')
      return
    }

    toast(`Analyzing ${leadsWithoutAnalysis.length} sites…`)
    setAnalyzing(true)

    for (const lead of leadsWithoutAnalysis) {
      await analyzeSite(lead.website, { leadId: lead.id })
    }

    setAnalyzing(false)
    toast.success(`Batch analysis complete`)
    load()
  }

  // Filter & search
  const filtered = analyses.filter(a => {
    if (filter !== 'all' && a.status !== filter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        a.domain.toLowerCase().includes(q) ||
        a.url.toLowerCase().includes(q) ||
        (a.lead?.company || '').toLowerCase().includes(q) ||
        (a.lead?.name || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  // Stats
  const stats = {
    total: analyses.length,
    complete: analyses.filter(a => a.status === 'complete').length,
    avgScore: analyses.filter(a => a.score_overall !== null).length > 0
      ? Math.round(analyses.filter(a => a.score_overall !== null).reduce((s, a) => s + (a.score_overall || 0), 0) / analyses.filter(a => a.score_overall !== null).length)
      : 0,
    noVideo: analyses.filter(a => a.status === 'complete' && (a.content_audit?.video_count ?? 0) === 0).length,
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Radar className="h-5 w-5 text-violet-500" />
            <h1 className="text-2xl font-semibold text-foreground">Site Analyzer</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Analyze client websites for tech stack, SEO health, content gaps, and AI-powered sales intelligence
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { loadLeads(); handleBatchAnalyze() }} disabled={analyzing} className="gap-2">
            <Zap className="h-4 w-4" />Batch Analyze
          </Button>
          <Button onClick={openDialog} className="gap-2 bg-violet-600 hover:bg-violet-700">
            <Plus className="h-4 w-4" />Analyze Site
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Analyses', value: stats.total, icon: Globe, color: 'text-blue-400' },
          { label: 'Completed', value: stats.complete, icon: CheckCircle, color: 'text-emerald-400' },
          { label: 'Avg Score', value: stats.avgScore, icon: TrendingUp, color: 'text-amber-400' },
          { label: 'No Video', value: stats.noVideo, icon: Video, color: 'text-red-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-2xl font-bold font-mono">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by domain, company…"
            className="pl-9 h-8 text-xs"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'complete', 'failed', 'pending'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                filter === f
                  ? 'bg-violet-500/10 text-violet-400 font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5 ml-auto">
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radar className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-1">No analyses yet</h3>
          <p className="text-sm text-muted-foreground/60 mb-4">
            Analyze a client's website to get AI-powered intelligence for your sales outreach
          </p>
          <Button onClick={openDialog} className="gap-2 bg-violet-600 hover:bg-violet-700">
            <Plus className="h-4 w-4" />Analyze Your First Site
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Domain</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Lead</th>
                <th className="px-4 py-3 text-center text-xs font-mono text-muted-foreground">Scores</th>
                <th className="px-4 py-3 text-center text-xs font-mono text-muted-foreground">Video</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-right text-xs font-mono text-muted-foreground" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr
                  key={a.id}
                  className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors cursor-pointer"
                  onClick={() => a.status === 'complete' && navigate(`/site-analyzer/${a.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-md bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                        <Globe className="h-3.5 w-3.5 text-violet-400" />
                      </div>
                      <div>
                        <p className="font-medium text-xs text-foreground">{a.domain}</p>
                        <p className="text-[0.65rem] text-muted-foreground font-mono truncate max-w-[200px]">{a.url}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.lead ? (
                      <div>
                        <p className="text-xs font-medium">{a.lead.company || a.lead.name}</p>
                        <p className="text-[0.65rem] text-muted-foreground">{a.lead.name}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.status === 'complete' ? (
                      <div className="flex items-center justify-center gap-3">
                        <ScoreGauge score={a.score_overall} label="Overall" size="sm" />
                        <ScoreGauge score={a.score_seo} label="SEO" size="sm" />
                        <ScoreGauge score={a.score_content} label="Content" size="sm" />
                        <ScoreGauge score={a.score_performance} label="Perf" size="sm" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50 flex justify-center">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {a.status === 'complete' ? (
                      (a.content_audit?.video_count ?? 0) === 0 ? (
                        <Badge variant="outline" className="text-[0.6rem] border-red-500/30 text-red-400 gap-1">
                          <Video className="h-2.5 w-2.5" />None
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[0.6rem] border-emerald-500/30 text-emerald-400 gap-1">
                          <Video className="h-2.5 w-2.5" />{a.content_audit.video_count}
                        </Badge>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      {a.status === 'complete' && (
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => navigate(`/site-analyzer/${a.id}`)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                        onClick={() => handleDelete(a.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Analyze dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radar className="h-5 w-5 text-violet-500" />
              Analyze Website
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAnalyze} className="space-y-4">
            <div className="space-y-2">
              <Label>Website URL *</Label>
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Link to Lead (optional)</Label>
              <Select value={selectedLead} onValueChange={handleLeadSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a lead…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No lead</SelectItem>
                  {leads.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.company || l.name} — {l.website}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {analyzing && statusMsg && (
              <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border border-violet-500/20 rounded-md">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
                <span className="text-xs text-violet-300">{statusMsg}</span>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={analyzing}>
                Cancel
              </Button>
              <Button type="submit" disabled={analyzing || !url.trim()} className="gap-2 bg-violet-600 hover:bg-violet-700">
                {analyzing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Analyzing…</>
                ) : (
                  <><Sparkles className="h-4 w-4" />Analyze</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
