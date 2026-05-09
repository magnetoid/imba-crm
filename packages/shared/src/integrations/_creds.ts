import { supabase } from '../supabase/client'

/**
 * Read a stored secret from `crm_provider_credentials`. Throws if the
 * row exists but `api_key` is null/empty — caller decides whether that's
 * a hard error or a "skip if unconfigured" path.
 *
 * Only callers running with the service_role JWT (i.e. the worker, NOT
 * the browser) can SELECT this table — RLS enforces it.
 */
export async function getProviderCredential(
  provider: string,
): Promise<{ apiKey: string | null; extra: Record<string, unknown> }> {
  const { data, error } = await supabase
    .from('crm_provider_credentials')
    .select('api_key, extra')
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw new Error(`failed to load ${provider} credential: ${error.message}`)
  const row = data as { api_key: string | null; extra: Record<string, unknown> | null } | null
  return {
    apiKey: row?.api_key ?? null,
    extra: row?.extra ?? {},
  }
}

export class IntegrationError extends Error {
  constructor(public readonly provider: string, message: string, public readonly status?: number) {
    super(`[${provider}] ${message}`)
  }
}
