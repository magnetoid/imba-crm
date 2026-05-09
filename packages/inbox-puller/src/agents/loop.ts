// Agent loop. Picks up crm_agent_jobs that need work and runs them.
//
// A job is "ready to pick up" when its status is 'queued' (fresh) or
// 'approved' (approval-mode resume — though approvals are handled inside
// runtime.ts via polling, so most resumes don't need this loop). We
// claim each job by flipping status='running' atomically before kicking
// off so two workers can't run the same job.

import { supabase } from '../supabase.js'
import { resolveAutonomy, buildContext, StepHalted, type JobRow } from './runtime.js'
import { AGENT_REGISTRY, isKnownAgent } from './registry.js'

const BATCH = 5

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'agent-loop', ...extra, time: new Date().toISOString() }))
}

export async function pollAgentJobs() {
  const { data: rows } = await supabase
    .from('crm_agent_jobs')
    .select('id, agent_kind, status, autonomy, input, output, lead_id, company_id, started_at, finished_at, error, created_at')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(BATCH)
  const jobs = (rows as JobRow[] | null) ?? []
  if (jobs.length === 0) return

  for (const job of jobs) {
    if (!isKnownAgent(job.agent_kind)) {
      await fail(job.id, `unknown agent_kind: ${job.agent_kind}`)
      continue
    }
    // Resolve autonomy now so it's frozen for the job.
    const autonomy = await resolveAutonomy(job.agent_kind)
    const claim = await supabase
      .from('crm_agent_jobs')
      .update({
        status: 'running',
        autonomy,
        started_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'queued')
      .select('id')
      .maybeSingle()
    if (!claim.data) continue   // someone else picked it up

    const claimed: JobRow = { ...job, status: 'running', autonomy }
    const ctx = buildContext(claimed)
    try {
      const runner = AGENT_REGISTRY[job.agent_kind]
      const out = await runner(ctx, claimed)
      await supabase.from('crm_agent_jobs').update({
        status: 'finished',
        output: out ?? {},
        finished_at: new Date().toISOString(),
      }).eq('id', job.id)
      log('info', 'agent finished', { jobId: job.id, kind: job.agent_kind })
    } catch (err) {
      if (err instanceof StepHalted) {
        // Already marked paused/cancelled by the runtime.
        log('info', 'agent halted', { jobId: job.id, reason: err.reason })
        continue
      }
      const message = (err as Error).message
      await fail(job.id, message)
      log('error', 'agent threw', { jobId: job.id, kind: job.agent_kind, error: message })
    }
  }
}

async function fail(jobId: string, error: string) {
  await supabase.from('crm_agent_jobs').update({
    status: 'failed',
    error: error.slice(0, 500),
    finished_at: new Date().toISOString(),
  }).eq('id', jobId)
}
