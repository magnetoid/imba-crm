import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { Badge } from '@imba/shared/ui/badge'
import { Loader2, Bot, ArrowRight, CheckCircle2, XCircle, AlertCircle, Pause, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

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
      <p className="text-muted-foreground text-sm mb-8">
        Each row is a job an agent ran. In approval mode, the worker pauses
        after each step and waits for you to approve here.
      </p>

      {loading ? (
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
      )}
    </div>
  )
}
