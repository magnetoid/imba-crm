// Tiny shared hook so Lead Finder + Onboarding Card don't both fire
// list_provider_credentials independently. One fetch per session; cache
// persists for the SPA lifetime.

import { useEffect, useState } from 'react'
import { supabase } from '@imba/shared/supabase'

let cached: boolean | null = null
let pending: Promise<boolean> | null = null

async function fetchOnce(): Promise<boolean> {
  if (cached !== null) return cached
  if (pending) return pending
  pending = (async () => {
    const { data } = await supabase.rpc('list_provider_credentials')
    const rows = (data as Array<{ provider: string; has_key: boolean }> | null) ?? []
    const apify = rows.find(r => r.provider === 'apify')
    cached = !!apify?.has_key
    pending = null
    return cached
  })()
  return pending
}

export function useApifyConfigured(): boolean | null {
  const [v, setV] = useState<boolean | null>(cached)
  useEffect(() => {
    let stopped = false
    void fetchOnce().then(b => { if (!stopped) setV(b) })
    return () => { stopped = true }
  }, [])
  return v
}
