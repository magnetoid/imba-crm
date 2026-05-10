import { supabase } from '../supabase/client'

export type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'perplexity' | 'ollama' | 'openrouter'

export interface AIRequestOptions {
  maxTokens?: number
  provider?: AIProvider
  model?: string
  temperature?: number
  json?: boolean
  feature?: string
  lead_id?: string
  task_type?: string
  prompt_key?: string
  prompt_version?: number
}

export interface CRMRuntimeSettings {
  active_ai_provider: AIProvider
  active_ai_model: string
  anthropic_model: string
  anthropic_models: string[]
  anthropic_temperature: number
  openai_model: string
  openai_models: string[]
  gemini_model: string
  gemini_models: string[]
  perplexity_model: string
  perplexity_models: string[]
  ollama_base_url: string
  ollama_model: string
  ollama_models: string[]
  openrouter_model: string
  openrouter_models: string[]
  smtp_host: string
  smtp_port: string
  smtp_secure: boolean
  smtp_username: string
  smtp_from_name: string
  smtp_from_email: string
  imap_enabled: boolean
  imap_host: string
  imap_port: string
  imap_secure: boolean
  imap_username: string
  imap_folder: string
  imap_poll_seconds: number
  imap_last_success_at?: string | null
  imap_last_error?: string | null
  imap_last_error_at?: string | null
  pop3_enabled: boolean
  pop3_host: string
  pop3_port: string
  pop3_secure: boolean
  pop3_username: string
  pop3_leave_on_server: boolean
  pop3_last_success_at?: string | null
  pop3_last_error?: string | null
  pop3_last_error_at?: string | null
  ai_outreach_tone: string
  ai_auto_enrich: boolean
  ai_inbox_auto_categorize: boolean
  company_name: string
  company_description: string
  usp: string
  scheduling_url: string
  lead_sources_enabled: string[]
  outreach_daily_limit: number
  ai_monthly_cap_cents: number
  ai_soft_cap_cents: number
  ai_cap_action: 'block' | 'downgrade' | 'require_approval'
  nomo_enabled?: boolean
  nomo_mode?: 'chat-only' | 'approval' | 'autopilot'
  nomo_autopilot_tools?: string[]
  nomo_system_prompt?: string
}

export interface ProviderCredentialStatus {
  provider: string
  has_key: boolean
  updated_at: string
}

export const DEFAULT_CRM_RUNTIME_SETTINGS: CRMRuntimeSettings = {
  active_ai_provider: 'anthropic',
  active_ai_model: 'claude-sonnet-4-20250514',
  anthropic_model: 'claude-sonnet-4-20250514',
  anthropic_models: [],
  anthropic_temperature: 0.2,
  openai_model: 'gpt-4o-mini',
  openai_models: [],
  gemini_model: 'gemini-2.5-flash',
  gemini_models: [],
  perplexity_model: 'sonar',
  perplexity_models: [],
  ollama_base_url: 'http://host.docker.internal:11434',
  ollama_model: 'llama3.1',
  ollama_models: [],
  openrouter_model: 'anthropic/claude-sonnet-4',
  openrouter_models: [],
  smtp_host: '',
  smtp_port: '587',
  smtp_secure: false,
  smtp_username: '',
  smtp_from_name: 'Imba Production',
  smtp_from_email: '',
  imap_enabled: false,
  imap_host: '',
  imap_port: '993',
  imap_secure: true,
  imap_username: '',
  imap_folder: 'INBOX',
  imap_poll_seconds: 60,
  imap_last_success_at: null,
  imap_last_error: null,
  imap_last_error_at: null,
  pop3_enabled: false,
  pop3_host: '',
  pop3_port: '995',
  pop3_secure: true,
  pop3_username: '',
  pop3_leave_on_server: true,
  pop3_last_success_at: null,
  pop3_last_error: null,
  pop3_last_error_at: null,
  ai_outreach_tone: 'professional',
  ai_auto_enrich: true,
  ai_inbox_auto_categorize: true,
  company_name: 'Imba Production',
  company_description: 'Cinematic video production powered by AI strategy.',
  usp: 'We combine human creativity with AI to produce cinematic-quality videos at scale.',
  scheduling_url: '',
  lead_sources_enabled: ['manual', 'quote_form', 'ai_search'],
  outreach_daily_limit: 50,
  ai_monthly_cap_cents: 50000,
  ai_soft_cap_cents: 35000,
  ai_cap_action: 'block',
  nomo_enabled: true,
  nomo_mode: 'approval',
  nomo_autopilot_tools: [
    'search_leads','get_lead','query_pipeline','get_metrics',
    'summarize_period','find_recent_signals',
  ],
  nomo_system_prompt: '',
}

export async function callAI<T = string>(prompt: string, options?: AIRequestOptions): Promise<T> {
  // 1. Fetch runtime settings to check cost caps
  let settings: CRMRuntimeSettings | null = null;
  try {
    settings = await getCRMRuntimeSettings();
  } catch (e) {
    console.warn('Failed to load settings for cost cap check', e);
  }

  let currentCost = 0;
  if (settings && settings.ai_monthly_cap_cents > 0) {
    // Calculate current month's cost
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: costData } = await supabase
      .from('ai_generations')
      .select('cost_cents')
      .gte('created_at', startOfMonth.toISOString());
    
    currentCost = (costData || []).reduce((sum, row) => sum + (row.cost_cents || 0), 0);
    
    if (currentCost >= settings.ai_monthly_cap_cents) {
      if (settings.ai_cap_action === 'block') {
        throw new Error(`AI Cost Cap Exceeded: The organization has reached its monthly limit of $${(settings.ai_monthly_cap_cents / 100).toFixed(2)}.`);
      } else if (settings.ai_cap_action === 'downgrade') {
        options = { ...options, provider: 'anthropic', model: 'claude-3-haiku-20240307' };
      }
    }
  }

  const response = await fetch('/api/ai/route', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task: {
        type: 'reasoning',
        messages: [{ role: 'user', content: prompt }],
      },
      providerConfigs: options?.provider ? {
        [options.provider]: { modelId: options.model, temperature: options.temperature }
      } : undefined,
      policyOverride: options?.provider ? {
        reasoning: [{ provider: options.provider, modelId: options.model || '' }]
      } : undefined
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`AI Request failed: ${response.status} ${text}`)
  }

  const result = await response.json()
  
  if (!result.ok) {
    throw new Error(`AI Router error: ${result.error?.message || 'Unknown error'}`)
  }

  const rawContent = result.data?.content || ''
  
  // Log to ai_generations
  try {
    const userRes = await supabase.auth.getUser()
    await supabase.from('ai_generations').insert({
      feature: options?.feature || 'general',
      task_type: options?.task_type || 'reasoning',
      lead_id: options?.lead_id || null,
      input_text: prompt,
      output_text: rawContent,
      provider: result.event?.provider,
      model: result.event?.model,
      tokens_in: result.event?.tokensIn,
      tokens_out: result.event?.tokensOut,
      cost_cents: result.event?.costCents,
      prompt_key: options?.prompt_key || null,
      prompt_version: options?.prompt_version || null,
      status: (settings?.ai_cap_action === 'require_approval' && currentCost >= (settings.ai_monthly_cap_cents || 0)) ? 'draft' : 'logged',
      created_by: userRes.data.user?.id
    })
  } catch (e) {
    console.error('Failed to log AI generation:', e)
  }

  if (options?.json) {
    try {
      // Try to parse the content as JSON if requested
      const jsonStr = rawContent.replace(/```json\n?|\n?```/g, '').trim()
      return JSON.parse(jsonStr) as T
    } catch (e) {
      console.warn('Failed to parse AI response as JSON', rawContent)
      return rawContent as T
    }
  }

  return rawContent as T
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
  const safeColumns = [
    'active_ai_provider', 'active_ai_model',
    'anthropic_model', 'anthropic_models', 'anthropic_temperature',
    'openai_model', 'openai_models',
    'gemini_model', 'gemini_models',
    'perplexity_model', 'perplexity_models',
    'ollama_base_url', 'ollama_model', 'ollama_models',
    'openrouter_model', 'openrouter_models',
    'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_username',
    'smtp_from_name', 'smtp_from_email',
    'ai_outreach_tone', 'ai_auto_enrich', 'ai_inbox_auto_categorize',
    'company_name', 'company_description', 'usp', 'scheduling_url',
    'lead_sources_enabled', 'outreach_daily_limit',
    'ai_monthly_cap_cents', 'ai_soft_cap_cents', 'ai_cap_action',
    'nomo_enabled', 'nomo_mode', 'nomo_autopilot_tools', 'nomo_system_prompt',
    'smtp_inbox_health', 'smtp_inbox_health_at',
  ].join(',')

  const { data, error } = await supabase
    .from('crm_runtime_settings')
    .select(safeColumns)
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
  merged.openrouter_models = normalizeStringArray(merged.openrouter_models)
  merged.nomo_autopilot_tools = normalizeStringArray(merged.nomo_autopilot_tools)
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
