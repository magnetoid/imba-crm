import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { Badge } from '@imba/shared/ui/badge'
import { Loader2, Bot, ArrowRight, CheckCircle2, XCircle, AlertCircle, Pause, Clock, History } from 'lucide-react'
import toast from 'react-hot-toast'

type ActivityTab = 'jobs' | 'audit'

interface AiGeneration {
  id: string
  feature: string | null
  task_type: string | null
  provider: string | null
  model: string | null
  tokens_in: number | null
  tokens_out: number | null
  cost_cents: number | null
  status: string | null
  created_at: string
  lead_id: string | null
}

interface AgentJob {
  id: string
  agent_kind: string
  status: string
  autonomy: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  lead_id: string | null
  created_at: string
  finished_at: string | null
  error: string | null
}

const STATUS_BADGE: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  queued:             { label: 'Queued',          className: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',     icon: Clock },
  running:            { label: 'Running',         className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',     icon: Loader2 },
  awaiting_approval:  { label: 'Needs approval',  className: 'bg-amber-200 text-amber-700 border-amber-500/40',  icon: AlertCircle },
  paused:             { label: 'Paused',          className: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',     icon: Pause },
  finished:           { label: 'Done',            className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: CheckCircle2 },
  cancelled:          { label: 'Cancelled',       className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',     icon: XCircle },
  failed:             { label: 'Failed',          className: 'bg-red-500/15 text-red-300 border-red-500/30',        icon: XCircle },
}

export default function Agents() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<AgentJob[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ActivityTab>(() => {
    if (typeof window === 'undefined') return 'jobs'
    return (window.location.hash.replace('#', '') === 'audit') ? 'audit' : 'jobs'
  })
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash !== `#${tab}`) {
      window.history.replaceState(null, '', `#${tab}`)
    }
  }, [tab])
  const [audit, setAudit] = useState<AiGeneration[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_agent_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setJobs((data as AgentJob[]) || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Audit log loader — pulls ai_generations (the cost+token+model
  // trail every callAIJSON write). Lazy-loaded when the operator
  // opens the Audit tab.
  const loadAudit = useCallback(async () => {
    setAuditLoading(true)
    const { data } = await supabase
      .from('ai_generations')
      .select('id, feature, task_type, provider, model, tokens_in, tokens_out, cost_cents, status, created_at, lead_id')
      .order('created_at', { ascending: false })
      .limit(100)
    setAudit((data as AiGeneration[]) || [])
    setAuditLoading(false)
  }, [])
  useEffect(() => {
    if (tab === 'audit' && audit.length === 0) void loadAudit()
  }, [tab, audit.length, loadAudit])

  // Realtime: react to job status changes (and new rows) without
  // polling. Plus a 30s safety-net interval in case the websocket drops.
  useEffect(() => {
    const channel = supabase
      .channel('agents-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_agent_jobs' },
        () => load(),
      )
      .subscribe()
    const t = setInterval(() => load(), 30_000)
    return () => { void supabase.removeChannel(channel); clearInterval(t) }
  }, [load])

  async function quickStart(kind: string, input: Record<string, unknown>) {
    const { data, error } = await supabase.from('crm_agent_jobs').insert({
      agent_kind: kind, status: 'queued', input,
      lead_id: input.lead_id ?? null, triggered_by: 'manual',
    }).select('id').maybeSingle()
    if (error) { toast.error(error.message); return }
    toast.success(`Queued ${kind}`)
    if (data) navigate(`/agents/${data.id}`)
    load()
  }

  const awaiting = jobs.filter(j => j.status === 'awaiting_approval').length

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-amber-500" />
          <h1 className="text-2xl font-semibold">Agents</h1>
          {awaiting > 0 && <Badge className="bg-amber-500 text-black">{awaiting} need approval</Badge>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => quickStart('lead-finder', {
            actor_id: 'apify/web-scraper',
            actor_input: { startUrls: [{ url: 'https://example.com' }] },
            max_save: 50,
          })}>
            Run lead-finder
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Two views: <strong>Jobs</strong> shows agent runs (lead-finder, outreach-drafter…). <strong>Audit</strong> shows every AI call's cost + tokens + status.
      </p>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {([['jobs', 'Jobs', Bot], ['audit', 'Audit (AI calls)', History]] as Array<[ActivityTab, string, typeof Bot]>).map(([id, label, Icon]) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 -mb-px text-sm font-medium transition-colors border-b-2 ${
                active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'audit' ? (
        <AuditView rows={audit} loading={auditLoading} />
      ) : null}

      {tab === 'jobs' && (loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bot className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No agent jobs yet. Click "Run lead-finder" above to try one.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left text-xs font-mono tracking-widest uppercase text-muted-foreground">
                <th className="py-2.5 px-4">Agent</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Mode</th>
                <th className="py-2.5 px-4">Started</th>
                <th className="py-2.5 px-4">Duration</th>
                <th className="py-2.5 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => {
                const meta = STATUS_BADGE[j.status] ?? STATUS_BADGE.queued
                const Icon = meta.icon
                const dur = j.finished_at
                  ? Math.round((new Date(j.finished_at).getTime() - new Date(j.created_at).getTime()) / 1000)
                  : Math.round((Date.now() - new Date(j.created_at).getTime()) / 1000)
                return (
                  <tr key={j.id} className="border-t border-border hover:bg-muted/20 cursor-pointer"
                      onClick={() => navigate(`/agents/${j.id}`)}>
                    <td className="py-2.5 px-4 font-medium">{j.agent_kind}</td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border ${meta.className}`}>
                        <Icon className={`h-3 w-3 ${j.status === 'running' ? 'animate-spin' : ''}`} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-mono text-muted-foreground">{j.autonomy}</td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground">
                      {dur < 60 ? `${dur}s` : dur < 3600 ? `${Math.floor(dur/60)}m ${dur%60}s` : `${Math.floor(dur/3600)}h`}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground inline-block" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ── Audit (AI calls) view — merged from the old standalone module ──
function AuditView({ rows, loading }: { rows: AiGeneration[]; loading: boolean }) {
  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  if (rows.length === 0) return (
    <div className="text-center py-16 text-muted-foreground">
      <History className="h-10 w-10 mx-auto mb-3 opacity-20" />
      <p className="text-sm">No AI calls yet — once agents run, every call lands here with its cost + token count.</p>
    </div>
  )
  const totalCents = rows.reduce((acc, r) => acc + (r.cost_cents ?? 0), 0)
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Last 100 calls · total <strong className="font-mono">${(totalCents / 100).toFixed(2)}</strong>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left text-xs font-mono tracking-widest uppercase text-muted-foreground">
              <th className="px-3 py-2">Feature</th>
              <th className="px-3 py-2">Provider · Model</th>
              <th className="px-3 py-2 text-right">Tokens</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <p className="text-xs">{r.feature ?? '—'}</p>
                  {r.task_type && <p className="text-[10px] text-muted-foreground">{r.task_type}</p>}
                </td>
                <td className="px-3 py-1.5 text-xs">
                  <span className="text-muted-foreground">{r.provider ?? '?'} ·</span>{' '}
                  <span className="font-mono">{r.model ?? '?'}</span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs">
                  {(r.tokens_in ?? 0) + (r.tokens_out ?? 0)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs">
                  ${((r.cost_cents ?? 0) / 100).toFixed(3)}
                </td>
                <td className="px-3 py-1.5 text-xs">
                  {r.status === 'ok' ? (
                    <span className="text-emerald-700">ok</span>
                  ) : (
                    <span className="text-red-700">{r.status ?? 'error'}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
