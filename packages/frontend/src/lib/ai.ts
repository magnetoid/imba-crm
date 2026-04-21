import { supabase } from '@/lib/supabase'

export type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'perplexity' | 'ollama'

export interface AIRequestOptions {
  maxTokens?: number
  provider?: AIProvider
  model?: string
  temperature?: number
  json?: boolean
}

export interface CRMRuntimeSettings {
  active_ai_provider: AIProvider
  active_ai_model: string
  anthropic_api_key: string
  anthropic_model: string
  anthropic_models: string[]
  anthropic_temperature: number
  openai_api_key: string
  openai_model: string
  openai_models: string[]
  gemini_api_key: string
  gemini_model: string
  gemini_models: string[]
  perplexity_api_key: string
  perplexity_model: string
  perplexity_models: string[]
  ollama_base_url: string
  ollama_model: string
  ollama_models: string[]
  smtp_host: string
  smtp_port: string
  smtp_secure: boolean
  smtp_username: string
  smtp_password: string
  smtp_from_name: string
  smtp_from_email: string
  ai_outreach_tone: string
  ai_auto_enrich: boolean
  ai_inbox_auto_categorize: boolean
  company_name: string
  company_description: string
  usp: string
  scheduling_url: string
  lead_sources_enabled: string[]
  outreach_daily_limit: number
}

export const DEFAULT_CRM_RUNTIME_SETTINGS: CRMRuntimeSettings = {
  active_ai_provider: 'anthropic',
  active_ai_model: 'claude-sonnet-4-20250514',
  anthropic_api_key: '',
  anthropic_model: 'claude-sonnet-4-20250514',
  anthropic_models: [],
  anthropic_temperature: 0.2,
  openai_api_key: '',
  openai_model: 'gpt-4o-mini',
  openai_models: [],
  gemini_api_key: '',
  gemini_model: 'gemini-2.5-flash',
  gemini_models: [],
  perplexity_api_key: '',
  perplexity_model: 'sonar',
  perplexity_models: [],
  ollama_base_url: 'http://host.docker.internal:11434',
  ollama_model: 'llama3.1',
  ollama_models: [],
  smtp_host: '',
  smtp_port: '587',
  smtp_secure: false,
  smtp_username: '',
  smtp_password: '',
  smtp_from_name: 'Imba Production',
  smtp_from_email: '',
  ai_outreach_tone: 'professional',
  ai_auto_enrich: true,
  ai_inbox_auto_categorize: true,
  company_name: 'Imba Production',
  company_description: 'Cinematic video production powered by AI strategy.',
  usp: 'We combine human creativity with AI to produce cinematic-quality videos at scale.',
  scheduling_url: '',
  lead_sources_enabled: ['manual', 'quote_form', 'ai_search'],
  outreach_daily_limit: 50,
}

export async function callAI<T = string>(prompt: string, options?: AIRequestOptions): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      prompt,
      provider: options?.provider,
      maxTokens: options?.maxTokens,
      model: options?.model,
      temperature: options?.temperature,
      json: options?.json,
    },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data?.result as T
}

export async function callAIText(prompt: string, options?: Omit<AIRequestOptions, 'json'>): Promise<string> {
  return callAI<string>(prompt, options)
}

export async function callAIJSON<T>(prompt: string, options?: Omit<AIRequestOptions, 'json'>): Promise<T> {
  return callAI<T>(prompt, { ...options, json: true })
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export async function getCRMRuntimeSettings(): Promise<CRMRuntimeSettings> {
  const { data, error } = await supabase
    .from('crm_runtime_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error

  const merged = {
    ...DEFAULT_CRM_RUNTIME_SETTINGS,
    ...(data || {}),
  } as CRMRuntimeSettings

  merged.anthropic_models = normalizeStringArray(merged.anthropic_models)
  merged.openai_models = normalizeStringArray(merged.openai_models)
  merged.gemini_models = normalizeStringArray(merged.gemini_models)
  merged.perplexity_models = normalizeStringArray(merged.perplexity_models)
  merged.ollama_models = normalizeStringArray(merged.ollama_models)
  merged.active_ai_provider = (merged.active_ai_provider || 'anthropic') as AIProvider
  merged.active_ai_model = merged.active_ai_model || merged[`${merged.active_ai_provider}_model` as keyof CRMRuntimeSettings] as string || DEFAULT_CRM_RUNTIME_SETTINGS.active_ai_model

  return merged
}

export function buildCompanyContext(settings: CRMRuntimeSettings) {
  return [
    `Company: ${settings.company_name}`,
    `Description: ${settings.company_description || 'N/A'}`,
    `USP: ${settings.usp || 'N/A'}`,
    settings.scheduling_url ? `Scheduling URL: ${settings.scheduling_url}` : null,
  ].filter(Boolean).join('\n')
}
