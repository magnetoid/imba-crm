import { supabase } from '@/lib/supabase'

export async function isAdminUser(): Promise<boolean> {
  const { data: userRes } = await supabase.auth.getUser()
  const roleFromMeta = (userRes.user?.app_metadata as any)?.role || (userRes.user?.user_metadata as any)?.role
  if (roleFromMeta === 'admin') return true

  const { data: rpcRes, error: rpcErr } = await supabase.rpc('is_admin')
  if (!rpcErr && typeof rpcRes === 'boolean') return rpcRes

  return false
}
