import { supabase } from '@/lib/supabase'

interface RoleMetadata {
  role?: string
}

export async function isAdminUser(): Promise<boolean> {
  const { data: userRes } = await supabase.auth.getUser()
  const app = userRes.user?.app_metadata as RoleMetadata | undefined
  const user = userRes.user?.user_metadata as RoleMetadata | undefined
  if (app?.role === 'admin' || user?.role === 'admin') return true

  const { data: rpcRes, error: rpcErr } = await supabase.rpc('is_admin')
  if (!rpcErr && typeof rpcRes === 'boolean') return rpcRes

  return false
}
