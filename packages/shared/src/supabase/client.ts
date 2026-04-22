import { createClient } from '@supabase/supabase-js'

const _buildUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const isPlaceholder = !_buildUrl || _buildUrl.includes('placeholder') || _buildUrl.includes('undefined')
const supabaseUrl = isPlaceholder
  ? (typeof window !== 'undefined' ? `${window.location.origin}/supabase` : '/supabase')
  : _buildUrl

const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'placeholder'

if (isPlaceholder && typeof window !== 'undefined') {
  console.info('VITE_SUPABASE_URL not set — using nginx proxy at /supabase')
}

export const supabase = createClient(supabaseUrl!, supabaseAnonKey)
