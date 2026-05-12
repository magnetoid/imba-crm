// Worker Health card — polls /api/worker/health every 30s and shows
// a single-line status the operator can scan in <1s:
//
//   ● green  — worker ticked within the last 5 minutes
//   ● amber  — 5-15 minutes since last tick (or worker has consecutive
//              failures > 0)
//   ● red    — >15 minutes (worker is probably down) OR /healthz 4xx
//
// Clicking the card expands a per-loop detail panel with IMAP / POP3
// last-success + last-error timestamps + the queued-jobs count. No new
// schema — pulls from in-memory workerState (server.ts) and existing
// crm_runtime_settings columns.

import { useEffect, useState } from 'react'
import { supabase } from '@imba/shared/supabase'
import { Activity, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface HealthSnapshot {
  ok: boolean
  now_ms: number
  uptime_s: number
  last_tick_at_ms: number
  last_tick_age_s: number | null
  last_tick_duration_ms: number
  consecutive_failures: number
  queued_jobs: number
  imap: { last_synced_at: string | null; last_error_at: string | null; last_error: string | null }
  pop3: { last_synced_at: string | null; last_error_at: string | null; last_error: string | null }
  smtp_health_at: string | null
}

const POLL_MS = 30_000

function fmt(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)} min ago`
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)} h ago`
  return `${Math.floor(ms / 86400_000)} d ago`
}

export default function WorkerHealthCard() {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let stopped = false
    async function load() {
      try {
        const { data: session } = await supabase.auth.getSession()
        const token = session.session?.access_token
        const res = await fetch('/api/worker/health', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (stopped) return
        if (!res.ok) { setError(`worker /healthz returned ${res.status}`); setSnap(null); return }
        const json = await res.json() as HealthSnapshot
        setSnap(json); setError(null)
      } catch (err) {
        if (stopped) return
        setError((err as Error).message)
        setSnap(null)
      }
    }
    void load()
    const t = setInterval(load, POLL_MS)
    return () => { stopped = true; clearInterval(t) }
  }, [])

  // Compute status colour. Red overrides amber overrides green.
  let status: 'green' | 'amber' | 'red' = 'green'
  let statusLabel = 'Worker healthy'
  if (error || !snap) {
    status = 'red'
    statusLabel = error ? 'Worker unreachable' : 'Loading…'
  } else if (snap.last_tick_age_s == null) {
    status = 'amber'; statusLabel = 'Worker started — no tick yet'
  } else if (snap.last_tick_age_s > 900) {
    status = 'red'; statusLabel = `No worker activity for ${Math.floor(snap.last_tick_age_s / 60)} min`
  } else if (snap.last_tick_age_s > 300 || snap.consecutive_failures > 0) {
    status = 'amber'; statusLabel = snap.consecutive_failures > 0
      ? `Worker recovering — ${snap.consecutive_failures} consecutive failures`
      : `Worker slow — last tick ${Math.floor(snap.last_tick_age_s / 60)} min ago`
  } else {
    statusLabel = `Worker healthy — last tick ${snap.last_tick_age_s}s ago`
  }
  const dotColor = status === 'green' ? 'bg-emerald-500' : status === 'amber' ? 'bg-amber-500' : 'bg-red-500'
  const Icon = status === 'green' ? CheckCircle2 : AlertCircle

  return (
    <div className="mb-6 bg-card border border-border rounded-lg shadow-sm">
      <button
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor} flex-shrink-0`} />
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1 truncate">{statusLabel}</span>
        {snap && snap.queued_jobs > 0 && (
          <span className="text-[11px] font-mono text-muted-foreground">{snap.queued_jobs} queued</span>
        )}
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {expanded && snap && (
        <div className="px-4 pb-4 pt-1 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">Worker</p>
            <p>Uptime <span className="font-mono">{Math.floor(snap.uptime_s / 60)}m</span></p>
            <p>Last tick <span className="font-mono">{snap.last_tick_age_s}s</span> ago ({snap.last_tick_duration_ms}ms)</p>
            {snap.consecutive_failures > 0 && (
              <p className="text-amber-700">Failures: <span className="font-mono">{snap.consecutive_failures}</span></p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">IMAP</p>
            <p>Last poll <span className="font-mono">{fmt(snap.imap.last_synced_at)}</span></p>
            {snap.imap.last_error && (
              <p className="text-red-700 truncate" title={snap.imap.last_error}>
                Last error {fmt(snap.imap.last_error_at)}: {snap.imap.last_error.slice(0, 60)}
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">POP3</p>
            <p>Last poll <span className="font-mono">{fmt(snap.pop3.last_synced_at)}</span></p>
            {snap.pop3.last_error && (
              <p className="text-red-700 truncate" title={snap.pop3.last_error}>
                Last error {fmt(snap.pop3.last_error_at)}: {snap.pop3.last_error.slice(0, 60)}
              </p>
            )}
          </div>
        </div>
      )}
      {error && <p className="px-4 pb-3 text-[11px] text-red-700">{error}</p>}
      <span style={{ display: 'none' }}><Icon /></span>
    </div>
  )
}
