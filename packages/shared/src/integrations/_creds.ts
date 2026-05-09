// Pure HTTP integration clients don't reach into Supabase directly —
// callers (the worker, an Edge Function, anywhere) load credentials from
// crm_provider_credentials with the service_role JWT and pass them in.
// This keeps the clients runtime-agnostic and avoids importing the SPA's
// browser supabase client into Node contexts.

export class IntegrationError extends Error {
  constructor(public readonly provider: string, message: string, public readonly status?: number) {
    super(`[${provider}] ${message}`)
  }
}

export interface ProviderCredential {
  apiKey: string
  /** Free-form per-provider extras (e.g. browserbase project_id, an
   *  Apify actor id, or LinkedIn cookie metadata). */
  extra?: Record<string, unknown>
}
