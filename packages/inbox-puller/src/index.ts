import { getRuntimeSettings, supabase } from './supabase.js'
import { pollImap } from './imap.js'
import { pollPop3 } from './pop3.js'
import { pollOutreach } from './send-email.js'
import { dispatchAttempts } from './channels/dispatch.js'
import { pollAgentJobs }   from './agents/loop.js'
import { dispatchSequences } from './sequences/dispatcher.js'
import { runSignalWatchers } from './signals/watchers.js'
import { refreshMailReachHealth } from './deliverability.js'
import { startHttpServer } from './server.js'

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'inbox-puller', ...extra, time: new Date().toISOString() }))
}

const DEFAULT_INTERVAL_S = 60
const MIN_INTERVAL_S = 15
const MAX_INTERVAL_S = 3600

// Worker uptime + last-tick bookkeeping. Read by the /healthz endpoint
// in server.ts so operators can verify the worker is alive without
// having to ssh into the container and tail logs.
export const workerState: {
  started_at_ms: number
  last_tick_at_ms: number
  last_tick_duration_ms: number
  consecutive_failures: number
} = {
  started_at_ms: Date.now(),
  last_tick_at_ms: 0,
  last_tick_duration_ms: 0,
  consecutive_failures: 0,
}

let stopping = false
process.on('SIGTERM', () => { stopping = true; log('info', 'sigterm received, will exit after current cycle') })
process.on('SIGINT',  () => { stopping = true; log('info', 'sigint received, will exit after current cycle') })

async function tick(): Promise<number> {
  const settings = await getRuntimeSettings()
  if (!settings) {
    log('warn', 'no runtime settings row — skipping')
    return DEFAULT_INTERVAL_S
  }

  // Run all loops in parallel; they're independent and a stuck call on
  // one shouldn't block the others.
  await Promise.allSettled([
    pollImap(settings),
    pollPop3(settings),
    pollOutreach(),
    dispatchAttempts(),
    dispatchSequences(),
    pollAgentJobs(),
    maybeQueueDealHealthSweep(),
    maybeQueueProspectPipeline(),
    runSignalWatchers(),
    refreshMailReachHealth(),
    maybeQueueStaleProposalDrafts(),
    sweepStuckJobs(),                                  // S2.7
  ])

  const requested = settings.imap_poll_seconds || DEFAULT_INTERVAL_S
  const clamped = Math.max(MIN_INTERVAL_S, Math.min(MAX_INTERVAL_S, requested))
  // ±10% jitter so multi-replica deploys don't stampede the DB at the
  // same exact second. Compute fresh each tick.
  const jitterPct = 0.9 + Math.random() * 0.2
  return Math.round(clamped * jitterPct)
}

// Stuck-job sweeper. Any agent_job in status='running' with
// updated_at > 15 minutes ago is presumed crashed mid-step. Marks it
// failed with a clear error string so the operator sees it in the
// Agents UI instead of it sitting silent forever.
let lastStuckSweep = 0
const STUCK_SWEEP_INTERVAL_MS = 5 * 60 * 1000
async function sweepStuckJobs() {
  const now = Date.now()
  if (now - lastStuckSweep < STUCK_SWEEP_INTERVAL_MS) return
  lastStuckSweep = now
  const cutoff = new Date(now - 15 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('crm_agent_jobs')
    .update({
      status: 'failed',
      error: 'stalled — no heartbeat for 15 minutes',
      finished_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('updated_at', cutoff)
    .select('id')
  if (error) { log('warn', 'stuck-job sweep failed', { error: error.message }); return }
  const swept = (data as Array<{ id: string }> | null)?.length ?? 0
  if (swept > 0) log('warn', 'marked stalled jobs as failed', { count: swept })
}

// Once per ~24h enqueue a deal-health-scorer sweep job (no lead_id).
// We use the most recent finished sweep as the cursor; if none exists
// or it's older than the interval, drop a new job in the queue.
let lastSweepCheck = 0
const SWEEP_INTERVAL_MS = 24 * 3600 * 1000
async function maybeQueueDealHealthSweep() {
  const now = Date.now()
  if (now - lastSweepCheck < 60 * 60 * 1000) return  // rate-limit the *check*
  lastSweepCheck = now

  const { data } = await supabase
    .from('crm_agent_jobs')
    .select('finished_at')
    .eq('agent_kind', 'deal-health-scorer')
    .is('lead_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const last = (data as { finished_at: string | null } | null)?.finished_at
  const lastMs = last ? new Date(last).getTime() : 0
  if (now - lastMs < SWEEP_INTERVAL_MS) return

  await supabase.from('crm_agent_jobs').insert({
    agent_kind: 'deal-health-scorer',
    input: { reason: 'daily-sweep' },
    triggered_by: 'cron:24h',
  })
  log('info', 'queued deal-health-scorer sweep')
}

// Once per 24h enqueue a prospect-pipeline sweep so the autonomous
// reach-best-customers loop runs without operator intervention.
let lastProspectCheck = 0
async function maybeQueueProspectPipeline() {
  const now = Date.now()
  if (now - lastProspectCheck < 60 * 60 * 1000) return
  lastProspectCheck = now

  const { data: settingsRow } = await supabase
    .from('crm_runtime_settings')
    .select('signals_enabled')   // reuse this as a proxy "autonomous loop on" toggle
    .eq('id', 1).maybeSingle()
  if (!(settingsRow as { signals_enabled?: boolean } | null)?.signals_enabled) return

  const { data } = await supabase
    .from('crm_agent_jobs')
    .select('finished_at')
    .eq('agent_kind', 'prospect-pipeline')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const last = (data as { finished_at: string | null } | null)?.finished_at
  const lastMs = last ? new Date(last).getTime() : 0
  if (now - lastMs < SWEEP_INTERVAL_MS) return

  await supabase.from('crm_agent_jobs').insert({
    agent_kind: 'prospect-pipeline',
    input: { mode: 'sweep' },
    triggered_by: 'cron:24h',
  })
  log('info', 'queued prospect-pipeline sweep')
}

async function main() {
  log('info', 'inbox-puller started', {
    supabase_url: process.env.SUPABASE_URL,
    has_service_key: !!process.env.SUPABASE_SERVICE_KEY,
    track_base: process.env.TRACK_BASE_URL,
    has_jwt_secret: !!process.env.JWT_SECRET,
  })

  // HTTP surface (tracking endpoints + connection-test RPCs).
  startHttpServer()

  while (!stopping) {
    const start = Date.now()
    let nextDelay = DEFAULT_INTERVAL_S
    try {
      nextDelay = await tick()
      workerState.consecutive_failures = 0
    } catch (err) {
      log('error', 'tick threw', { error: (err as Error).message })
      workerState.consecutive_failures++
      // Exponential backoff after 3 consecutive failures: 1×, 2×, 4×,
      // 8×, capped at MAX_INTERVAL_S. Recovers immediately on first
      // successful tick.
      if (workerState.consecutive_failures > 3) {
        const factor = Math.min(2 ** (workerState.consecutive_failures - 3), 16)
        nextDelay = Math.min(MAX_INTERVAL_S, nextDelay * factor)
        log('warn', 'backoff engaged', { factor, next_delay_s: nextDelay, failures: workerState.consecutive_failures })
      }
    }
    workerState.last_tick_at_ms = Date.now()
    workerState.last_tick_duration_ms = workerState.last_tick_at_ms - start
    if (stopping) break
    const elapsed = (Date.now() - start) / 1000
    const sleepFor = Math.max(0, nextDelay - elapsed)
    await new Promise(r => setTimeout(r, sleepFor * 1000))
  }
  log('info', 'inbox-puller exiting cleanly')
}

// Once per 24h scan for leads stuck in 'qualified' for ≥3 days
// with no proposal in the last 30d, and queue the proposal-writer
// agent on each. Default autonomy 'approval' so the operator still
// reviews. Bounded to 20 leads per sweep.
let lastProposalCheck = 0
async function maybeQueueStaleProposalDrafts() {
  const now = Date.now()
  if (now - lastProposalCheck < 60 * 60 * 1000) return
  lastProposalCheck = now

  // Look at one recent finished sweep to gate the daily cadence.
  const { data: lastJob } = await supabase
    .from('crm_agent_jobs')
    .select('finished_at')
    .eq('agent_kind', 'proposal-writer')
    .eq('triggered_by', 'cron:stale-qualified')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const last = (lastJob as { finished_at: string | null } | null)?.finished_at
  if (last && now - new Date(last).getTime() < 24 * 3600 * 1000) return

  // Find candidates: stage='qualified', stage_entered_at older than 3d,
  // not already in 'won'/'lost', no draft/sent proposal in last 30d.
  const threeDaysAgo = new Date(now - 3 * 86400 * 1000).toISOString()
  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id, stage_entered_at, name, company')
    .eq('stage', 'qualified')
    .lt('stage_entered_at', threeDaysAgo)
    .limit(20)
  const candidates = ((leads ?? []) as Array<{ id: string }>)
  if (candidates.length === 0) return

  let queued = 0
  for (const c of candidates) {
    // Skip if a recent proposal exists.
    const { data: existing } = await supabase
      .from('crm_proposals')
      .select('id')
      .eq('lead_id', c.id)
      .in('status', ['draft', 'sent', 'signed'])
      .gte('created_at', new Date(now - 30 * 86400 * 1000).toISOString())
      .maybeSingle()
    if (existing) continue
    await supabase.from('crm_agent_jobs').insert({
      agent_kind: 'proposal-writer',
      lead_id: c.id,
      input: { reason: 'stale-qualified-cron' },
      triggered_by: 'cron:stale-qualified',
    })
    queued++
  }
  if (queued > 0) log('info', 'queued proposal-writer for stale qualified', { count: queued })
}

main().catch(err => {
  log('error', 'fatal', { error: (err as Error).message })
  process.exit(1)
})
