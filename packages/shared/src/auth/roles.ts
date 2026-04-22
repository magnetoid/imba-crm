import type { Session } from '@supabase/supabase-js'

export type Role = 'admin' | 'crm_operator' | 'viewer'

/**
 * Roles are read from Supabase user metadata (`app_metadata.role`) first,
 * falling back to `user_metadata.role`. Server-side (RLS) should be the
 * authoritative check — this is only for UI gating.
 */
export function getRole(session: Session | null): Role | null {
  if (!session?.user) return null
  const app = (session.user.app_metadata as Record<string, unknown> | undefined)?.role
  const usr = (session.user.user_metadata as Record<string, unknown> | undefined)?.role
  const raw = (app ?? usr) as string | undefined
  if (raw === 'admin' || raw === 'crm_operator' || raw === 'viewer') return raw
  return null
}

export function hasRole(session: Session | null, ...allowed: Role[]): boolean {
  const r = getRole(session)
  return r !== null && allowed.includes(r)
}
