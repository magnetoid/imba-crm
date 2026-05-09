// Speed-to-lead browser alerts.
//
// The migration adds postgres triggers that insert into crm_hot_lead_alerts
// any time a high-fit-or-intent lead does something meaningful (replies,
// books a call, sends a widget message, …). This hook polls that table
// every 15s while the operator's tab is open and fires a desktop
// notification so the operator can be on a reply within ~minute of the
// signal landing — the single highest-leverage tactical change in the
// research, ~78% lift in contact rate.
//
// Why polling and not Realtime: Realtime is fine but needs the table
// added to the publication, plus careful disconnect handling. Polling
// keeps it dead simple; the worst case is a 15s delay on a hot signal
// which is still well inside the sub-5-min target.

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@imba/shared/supabase'
import { requestNotificationPermission, showNotification } from './crm-utils'

interface AlertRow {
  id: string
  lead_id: string
  reason: string
  source_table: string
  fit_score: number | null
  intent_score: number | null
  created_at: string
}

const POLL_MS = 15_000
const SEEN_KEY = 'crm_hot_seen_v1'

export function useHotLeadAlerts() {
  const navigate = useNavigate()
  const seenRef = useRef<Set<string>>(loadSeen())

  useEffect(() => {
    let stopped = false
    let timer: number | undefined

    void requestNotificationPermission()

    async function tick() {
      if (stopped) return
      try {
        const sinceIso = new Date(Date.now() - 24 * 3600_000).toISOString()
        const { data } = await supabase
          .from('crm_hot_lead_alerts')
          .select('id, lead_id, reason, source_table, fit_score, intent_score, created_at')
          .is('read_at', null)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(20)
        const rows = (data as AlertRow[] | null) ?? []
        for (const r of rows) {
          if (seenRef.current.has(r.id)) continue
          seenRef.current.add(r.id)
          fire(r)
        }
        persistSeen(seenRef.current)
      } catch { /* network blip — try next tick */ }
      timer = window.setTimeout(tick, POLL_MS)
    }

    function fire(r: AlertRow) {
      const fit = r.fit_score ?? 0
      const intent = r.intent_score ?? 0
      const heat = fit + intent >= 120 ? '🔥 ' : ''
      showNotification(
        `${heat}Hot lead: ${r.reason}`,
        `Fit ${r.fit_score ?? '—'} · Intent ${r.intent_score ?? '—'} · click to open`,
        () => {
          navigate(`/admin/crm/${r.lead_id}`)
          // best-effort mark read
          void supabase.from('crm_hot_lead_alerts').update({ read_at: new Date().toISOString() }).eq('id', r.id)
        },
      )
    }

    void tick()
    const onVisibility = () => { if (document.visibilityState === 'visible') void tick() }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [navigate])
}

function loadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch { return new Set() }
}

function persistSeen(set: Set<string>) {
  try {
    // Cap so the set doesn't grow unbounded across a long session.
    const arr = Array.from(set).slice(-200)
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(arr))
  } catch { /* private mode */ }
}
