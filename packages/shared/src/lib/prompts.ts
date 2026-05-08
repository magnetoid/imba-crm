import { supabase } from '../supabase/client'

export interface PromptVersion {
  id: string
  prompt_key: string
  version: number
  description: string | null
  system_prompt: string | null
  user_prompt: string
  provider: string | null
  model: string | null
  is_active: boolean
  created_at: string
}

export interface PromptTemplate {
  key: string
  version: number
  system: string | null
  user: string
  provider?: string | null
  model?: string | null
}

export async function getActivePrompt(key: string): Promise<PromptTemplate> {
  const { data, error } = await supabase
    .from('crm_prompts')
    .select('*')
    .eq('prompt_key', key)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error(`Failed to fetch active prompt for key: ${key}`, error)
    throw new Error(`Failed to fetch prompt template: ${key}`)
  }

  if (!data) {
    throw new Error(`No active prompt found for key: ${key}`)
  }

  return {
    key: data.prompt_key,
    version: data.version,
    system: data.system_prompt,
    user: data.user_prompt,
    provider: data.provider,
    model: data.model,
  }
}

/**
 * Interpolates variables into a prompt template.
 * Variables should be formatted as {{variable_name}} in the template.
 */
export function interpolatePrompt(template: string, variables: Record<string, string | number | boolean | null | undefined>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    const stringValue = value === null || value === undefined ? '' : String(value)
    // Replace all occurrences of {{key}}
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    result = result.replace(regex, stringValue)
  }
  return result
}
