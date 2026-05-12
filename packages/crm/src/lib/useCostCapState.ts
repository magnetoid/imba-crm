// Polls crm_runtime_settings.ai_cap_state every 60s. Returns the
// current cap state (or null when below cap). Used by the Critical
// Banner + Pipeline / Agents pages so the operator sees an immediate
// red banner when AI spend hits the monthly ceiling, with a deep-link
// to Settings → Cost & limits.

import { useEffect, useState } from 'react'
import { supabase } from '@imba/shared/supabase'

export interface CostCapState {
  triggered_at: string
  current_cents: number
  cap_cents: number
  period_start: string
  action: 'block' | 'downgrade' | 'require_approval'
}

const POLL_MS = 60_000

export function useCostCapState(): CostCapState | null {
  const [state, setState] = useState<CostCapState | null>(null)

  useEffect(() => {
    let stopped = false
    async function load() {
      const { data } = await supabase
        .from('crm_runtime_settings')
        .select('ai_cap_state')
        .eq('id', 1)
        .maybeSingle()
      if (stopped) return
      const s = (data as { ai_cap_state?: CostCapState | null } | null)?.ai_cap_state ?? null
      setState(s)
    }
    void load()
    const t = setInterval(load, POLL_MS)
    return () => { stopped = true; clearInterval(t) }
  }, [])

  return state
}
