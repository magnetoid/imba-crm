import { getRuntimeSettings, supabase } from './supabase.js'
import { pollImap } from './imap.js'
import { pollPop3 } from './pop3.js'
import { pollOutreach } from './send-email.js'
import { dispatchAttempts } from './channels/dispatch.js'
import { pollAgentJobs }   from './agents/loop.js'
import { dispatchSequences } from './sequences/dispatcher.js'
import { runSignalWatchers } from './signals/watchers.js'
import { startHttpServer } from './server.js'

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'inbox-puller', ...extra, time: new Date().toISOString() }))
}

const DEFAULT_INTERVAL_S = 60
const MIN_INTERVAL_S = 15
const MAX_INTERVAL_S = 3600

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
    runSignalWatchers(),
  ])

  const requested = settings.imap_poll_seconds || DEFAULT_INTERVAL_S
  return Math.max(MIN_INTERVAL_S, Math.min(MAX_INTERVAL_S, requested))
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
    } catch (err) {
      log('error', 'tick threw', { error: (err as Error).message })
    }
    if (stopping) break
    const elapsed = (Date.now() - start) / 1000
    const sleepFor = Math.max(0, nextDelay - elapsed)
    await new Promise(r => setTimeout(r, sleepFor * 1000))
  }
  log('info', 'inbox-puller exiting cleanly')
}

main().catch(err => {
  log('error', 'fatal', { error: (err as Error).message })
  process.exit(1)
})
