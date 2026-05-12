// Centralised access to crm_runtime_settings. Replaces the ~15 direct
// `supabase.from('crm_runtime_settings').select(...)` calls scattered
// across modules with a single fetch + module-level cache + a realtime
// subscription so edits in Settings propagate everywhere without a
// manual refresh.
//
// Usage:
//   const { settings, loading, refresh } = useCRMRuntimeSettings()
//   const { settings } = useCRMRuntimeSettings(['smtp_from_email', 'icp_rules'])
//
// The second form is a hint for which columns the caller cares about
// (so the hook can skip re-rendering on unrelated field changes). The
// underlying fetch always pulls `*` — the projection only affects the
// "did something I care about change?" diff.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@imba/shared/supabase'

// Loose type — every consumer knows which fields it reads. We avoid
// hard-typing here so the hook isn't a chokepoint that has to be
// updated every time the schema gets a column.
export type RuntimeSettingsRow = Record<string, unknown> & { id: number }

interface Subscriber {
  hint: ReadonlyArray<string> | null      // null = "rerender on any change"
  notify: (row: RuntimeSettingsRow | null) => void
}

const subscribers: Set<Subscriber> = new Set()
let cached: RuntimeSettingsRow | null = null
let loadingNow: Promise<RuntimeSettingsRow | null> | null = null
let realtimeChannelStarted = false

async function fetchOnce(): Promise<RuntimeSettingsRow | null> {
  if (loadingNow) return loadingNow
  loadingNow = (async () => {
    const { data } = await supabase
      .from('crm_runtime_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    cached = (data as RuntimeSettingsRow | null) ?? null
    loadingNow = null
    return cached
  })()
  return loadingNow
}

function ensureRealtime() {
  if (realtimeChannelStarted) return
  realtimeChannelStarted = true
  supabase
    .channel('runtime-settings-hook')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'crm_runtime_settings' },
      (payload) => {
        const next = (payload.new as RuntimeSettingsRow) ?? null
        const prev = cached
        cached = next
        for (const s of subscribers) {
          if (!s.hint) { s.notify(next); continue }
          // Hint-aware: only notify if any hinted field changed.
          const changed = s.hint.some(k => (prev?.[k]) !== (next?.[k]))
          if (changed) s.notify(next)
        }
      },
    )
    .subscribe()
}

export function useCRMRuntimeSettings(hint?: ReadonlyArray<string>) {
  const [settings, setSettings] = useState<RuntimeSettingsRow | null>(cached)
  const [loading, setLoading] = useState(cached === null)

  useEffect(() => {
    let stopped = false
    ensureRealtime()
    const sub: Subscriber = {
      hint: hint ?? null,
      notify: (row) => { if (!stopped) setSettings(row) },
    }
    subscribers.add(sub)
    // Fetch (or join in-flight).
    void fetchOnce().then(row => {
      if (stopped) return
      setSettings(row)
      setLoading(false)
    })
    return () => { stopped = true; subscribers.delete(sub) }
  }, [hint])    // hint is a stable array reference per call site — fine

  const refresh = useCallback(async () => {
    cached = null
    const row = await fetchOnce()
    setSettings(row)
  }, [])

  return useMemo(() => ({ settings, loading, refresh }), [settings, loading, refresh])
}
