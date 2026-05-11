import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { Textarea } from '@imba/shared/ui/textarea'
import { Badge } from '@imba/shared/ui/badge'
import { Loader2, Bot, ArrowLeft, CheckCircle2, XCircle, Pencil } from 'lucide-react'
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

interface AgentRun {
  id: string
  step_no: number
  step_name: string
  status: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  edited_output: Record<string, unknown> | null
  error: string | null
  started_at: string
  finished_at: string | null
  cost_cents: number | null
  tokens_in: number | null
  tokens_out: number | null
  model: string | null
  decision_summary: string | null
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [job, setJob] = useState<AgentJob | null>(null)
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ runId: string; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    const [jobRes, runsRes] = await Promise.all([
      supabase.from('crm_agent_jobs').select('*').eq('id', id).maybeSingle(),
      supabase.from('crm_agent_runs').select('*').eq('job_id', id).order('step_no'),
    ])
    setJob(jobRes.data as AgentJob | null)
    setRuns((runsRes.data as AgentRun[]) || [])
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  // Live refresh — important for the approval flow.
  useEffect(() => {
    const t = setInterval(() => load(), 3000)
    return () => clearInterval(t)
  }, [load])

  async function approve(run: AgentRun, edited?: string) {
    const update: Record<string, unknown> = {
      status: 'approved',
      approved_at: new Date().toISOString(),
    }
    if (edited !== undefined && edited !== JSON.stringify(run.output)) {
      // Operator edited the output — store it. Most agents put their
      // human-meaningful text in output.body / output.suggested_reply,
      // so we set both shapes.
      update.edited_output = parseEditedJSON(edited, run.output)
    }
    const { error } = await supabase.from('crm_agent_runs').update(update).eq('id', run.id)
    if (error) { toast.error(error.message); return }
    toast.success('Approved')
    setEditing(null)
    load()
  }

  async function reject(run: AgentRun) {
    const { error } = await supabase.from('crm_agent_runs').update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
    }).eq('id', run.id)
    if (error) { toast.error(error.message); return }
    toast('Rejected — agent will stop')
    load()
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  if (!job)   return <div className="p-8 text-muted-foreground">Job not found.</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <button onClick={() => navigate('/agents')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to agents
      </button>
      <div className="flex items-center gap-3 mb-1">
        <Bot className="h-5 w-5 text-amber-500" />
        <h1 className="text-2xl font-semibold">{job.agent_kind}</h1>
        <Badge className="text-[0.65rem] font-mono">{job.autonomy}</Badge>
        <Badge className="text-[0.65rem] font-mono">{job.status}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-8 font-mono">{job.id}</p>

      {job.error && (
        <div className="border border-red-400/30 bg-red-50 rounded p-3 text-sm text-red-300 mb-6">
          {job.error}
        </div>
      )}

      <div className="space-y-3">
        {runs.map(r => (
          <RunCard key={r.id} run={r}
            isEditing={editing?.runId === r.id}
            editingText={editing?.runId === r.id ? editing.text : null}
            onEditChange={t => setEditing({ runId: r.id, text: t })}
            onCancelEdit={() => setEditing(null)}
            onStartEdit={() => setEditing({ runId: r.id, text: prettyJSON(r.output) })}
            onApprove={(edited) => approve(r, edited)}
            onReject={() => reject(r)}
          />
        ))}
        {runs.length === 0 && (
          <div className="text-sm text-muted-foreground border border-dashed border-border rounded p-6 text-center">
            No steps yet — the worker hasn't started this job.
          </div>
        )}
      </div>

      {job.output && Object.keys(job.output).length > 0 && (
        <div className="border border-border rounded-lg p-4 mt-6">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Final output</h2>
          <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground">{prettyJSON(job.output)}</pre>
        </div>
      )}
    </div>
  )
}

function RunCard({
  run, isEditing, editingText, onEditChange, onCancelEdit, onStartEdit, onApprove, onReject,
}: {
  run: AgentRun
  isEditing: boolean
  editingText: string | null
  onEditChange: (s: string) => void
  onCancelEdit: () => void
  onStartEdit: () => void
  onApprove: (edited?: string) => void
  onReject: () => void
}) {
  const isAwaiting = run.status === 'awaiting_approval'
  return (
    <div className={`border rounded-lg p-4 ${isAwaiting ? 'border-amber-500/40 bg-amber-50' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[0.6rem] font-mono text-muted-foreground/60">#{run.step_no}</span>
        <span className="font-medium text-sm">{run.step_name}</span>
        <Badge className="text-[0.6rem] font-mono ml-auto">{run.status}</Badge>
        {run.cost_cents != null && run.cost_cents > 0 && (
          <span className="text-[0.65rem] font-mono text-muted-foreground/60">${(run.cost_cents / 100).toFixed(3)}</span>
        )}
      </div>

      {/* Plain-language summary — the new primary line. Falls back to
          the raw payloads if no agent set one. */}
      {run.decision_summary && (
        <p className="text-sm mb-2 leading-snug">{run.decision_summary}</p>
      )}

      {Object.keys(run.input ?? {}).length > 0 && (
        <details className="mb-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">input</summary>
          <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground mt-1">{prettyJSON(run.input)}</pre>
        </details>
      )}

      {run.output && Object.keys(run.output).length > 0 && !isEditing && (
        // When we have a summary, hide raw output under a toggle so the
        // primary line carries the meaning. No summary → show as before.
        run.decision_summary ? (
          <details className="mb-2">
            <summary className="text-xs text-muted-foreground cursor-pointer">view raw output</summary>
            <pre className="text-xs whitespace-pre-wrap break-words bg-muted/30 rounded p-2 mt-1">{prettyJSON(run.output)}</pre>
          </details>
        ) : (
          <pre className="text-xs whitespace-pre-wrap break-words bg-muted/30 rounded p-2 mb-2">{prettyJSON(run.output)}</pre>
        )
      )}

      {isEditing && editingText !== null && (
        <Textarea
          rows={10}
          className="text-xs font-mono mb-2"
          value={editingText}
          onChange={e => onEditChange(e.target.value)}
        />
      )}

      {run.error && (
        <p className="text-xs text-red-300 mb-2">{run.error}</p>
      )}

      {isAwaiting && (
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <Button size="sm" className="h-7 text-xs gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-black"
                onClick={() => onApprove()}>
                <CheckCircle2 className="h-3 w-3" /> Approve & continue
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={onStartEdit}>
                <Pencil className="h-3 w-3" /> Edit & approve
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-red-500/30 text-red-300 hover:bg-red-100"
                onClick={onReject}>
                <XCircle className="h-3 w-3" /> Stop
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" className="h-7 text-xs gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-black"
                onClick={() => onApprove(editingText ?? undefined)}>
                <CheckCircle2 className="h-3 w-3" /> Save & approve
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={onCancelEdit}>
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function prettyJSON(v: unknown): string {
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}

function parseEditedJSON(text: string, fallback: Record<string, unknown> | null): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch { /* not JSON — wrap as { value } */ }
  return { value: text, ...(fallback ?? {}) }
}
