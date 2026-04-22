import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase/client'

export type AuthState =
  | { loading: true; session: null }
  | { loading: false; session: Session | null }

export function useSession(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, session: null })

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setState({ loading: false, session: data.session })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!cancelled) setState({ loading: false, session })
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return state
}
