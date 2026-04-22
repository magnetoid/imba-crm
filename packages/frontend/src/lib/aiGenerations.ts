import { supabase } from '@/lib/supabase'

export type AIFeature =
  | 'outreach_email'
  | 'proposal'
  | 'lead_score'
  | 'lead_enrich'
  | 'lead_search'
  | 'inbox_analyze'
  | 'inbox_reply_suggest'
  | 'analytics_insights'

export type AITaskType =
  | 'reasoning'
  | 'drafting'
  | 'classification'
  | 'extraction'
  | 'embedding'
  | 'research'
  | 'voice'
  | 'vision'

export type AIGenerationStatus =
  | 'logged'      // fire-and-forget, audit only
  | 'draft'       // approval pending
  | 'edited'      // human edited the AI output
  | 'approved'
  | 'rejected'
  | 'sent'

export interface AIGeneration {
  id: string
  feature: AIFeature
  task_type: AITaskType
  lead_id: string | null
  input_text: string
  input_meta: Record<string, unknown>
  output_text: string | null
  error_text: string | null
  provider: string | null
  model: string | null
  tokens_in: number | null
  tokens_out: number | null
  cost_cents: number | null
  prompt_key: string | null
  prompt_version: number | null
  status: AIGenerationStatus
  final_content: string | null
  approved_by: string | null
  approved_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface LogArgs {
  feature: AIFeature
  taskType: AITaskType
  input: string
  inputMeta?: Record<string, unknown>
  output?: string
  error?: string
  leadId?: string | null
  status?: AIGenerationStatus
  provider?: string
  model?: string
  tokensIn?: number
  tokensOut?: number
  costCents?: number
  promptKey?: string
  promptVersion?: number
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/**
 * Insert an audit row for a completed AI call. Returns the row id so the
 * caller can link it to the artifact it produced (email, proposal, …) or
 * later mark it approved.
 *
 * Never throws; logging must not break the primary flow. A console.warn is
 * the worst that happens.
 */
export async function logGeneration(args: LogArgs): Promise<string | null> {
  try {
    const created_by = await currentUserId()
    const { data, error } = await supabase
      .from('ai_generations')
      .insert({
        feature: args.feature,
        task_type: args.taskType,
        lead_id: args.leadId ?? null,
        input_text: args.input,
        input_meta: args.inputMeta ?? {},
        output_text: args.output ?? null,
        error_text: args.error ?? null,
        provider: args.provider ?? null,
        model: args.model ?? null,
        tokens_in: args.tokensIn ?? null,
        tokens_out: args.tokensOut ?? null,
        cost_cents: args.costCents ?? null,
        prompt_key: args.promptKey ?? null,
        prompt_version: args.promptVersion ?? null,
        status: args.status ?? (args.output ? 'logged' : 'logged'),
        created_by,
      })
      .select('id')
      .single()

    if (error) {
      console.warn('logGeneration failed:', error.message)
      return null
    }
    return data?.id ?? null
  } catch (e) {
    console.warn('logGeneration threw:', e)
    return null
  }
}

/**
 * Transition a draft generation to 'approved' and record who + when + the
 * final (possibly edited) content that is about to be acted on.
 */
export async function markApproved(
  generationId: string | null | undefined,
  finalContent: string,
): Promise<void> {
  if (!generationId) return
  try {
    const approved_by = await currentUserId()
    await supabase
      .from('ai_generations')
      .update({
        status: 'approved',
        final_content: finalContent,
        approved_by,
        approved_at: new Date().toISOString(),
      })
      .eq('id', generationId)
  } catch (e) {
    console.warn('markApproved failed:', e)
  }
}

export async function markSent(generationId: string | null | undefined): Promise<void> {
  if (!generationId) return
  try {
    await supabase
      .from('ai_generations')
      .update({ status: 'sent' })
      .eq('id', generationId)
  } catch (e) {
    console.warn('markSent failed:', e)
  }
}

export async function markRejected(
  generationId: string | null | undefined,
  reason?: string,
): Promise<void> {
  if (!generationId) return
  try {
    const rejected_by = await currentUserId()
    await supabase
      .from('ai_generations')
      .update({
        status: 'rejected',
        rejected_by,
        rejected_at: new Date().toISOString(),
        error_text: reason ?? null,
      })
      .eq('id', generationId)
  } catch (e) {
    console.warn('markRejected failed:', e)
  }
}

/**
 * Record that a human edited the AI output before approving. Saves the
 * post-edit content so the diff between output_text and final_content
 * represents the human's change.
 */
export async function markEdited(
  generationId: string | null | undefined,
  editedContent: string,
): Promise<void> {
  if (!generationId) return
  try {
    await supabase
      .from('ai_generations')
      .update({ status: 'edited', final_content: editedContent })
      .eq('id', generationId)
  } catch (e) {
    console.warn('markEdited failed:', e)
  }
}

export async function listRecentGenerations(limit = 50): Promise<AIGeneration[]> {
  const { data, error } = await supabase
    .from('ai_generations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.warn('listRecentGenerations failed:', error.message)
    return []
  }
  return (data as AIGeneration[]) ?? []
}
