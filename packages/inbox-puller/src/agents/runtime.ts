// Agent runtime — the wrapper every agent calls to run a step.
//
// Three operating modes per (job, agent_kind), resolved from
// crm_runtime_settings.agent_autonomy_overrides[kind] ?? agent_autonomy_default
// at job-pickup time and recorded on the job row so it can't change
// mid-flight:
//
//   manual   — the step doesn't run. The agent marks the run row
//              'manual_required' and exits. The operator does the
//              equivalent action in the regular module UI.
//   approval — the step runs (so operator sees the proposed output),
//              the run row is marked 'awaiting_approval', and the
//              wrapper waits for the operator to flip it to 'approved'
//              (or 'rejected') in the Agents UI before returning.
//   auto     — the step runs and immediately persists output as 'done'.
//
// Each ctx.step() inserts a crm_agent_runs row with cost/tokens so the
// Audit module can show the full chain of any job.

import { supabase } from '../supabase.js'

export type Autonomy = 'manual' | 'approval' | 'auto'

export interface RunCost {
  model?: string
  tokens_in?: number
  tokens_out?: number
  cost_cents?: number
}

export class StepHalted extends Error {
  constructor(public readonly reason: 'manual_required' | 'rejected', public readonly runId: string) {
    super(`step halted: ${reason}`)
  }
}

export interface AgentContext {
  jobId: string
  agentKind: string
  autonomy: Autonomy
  /**
   * Run a step. The operator-meaningful unit of work — drafting an email,
   * picking a meeting slot, deciding which Apify actor to run.
   *
   *   const draft = await ctx.step('draft-email', { lead_id }, async (s) => {
   *     const text = await callAI(...)
   *     s.cost({ model: 'claude-...', tokens_in: 800, tokens_out: 220, cost_cents: 4 })
   *     return text
   *   })
   *
   * If the autonomy mode is 'manual', the inner fn is NOT executed and
   * StepHalted is thrown. If 'approval', fn runs, then we wait for the
   * approval. If 'auto', fn runs and we return its value.
   */
  step<T>(name: string, input: Record<string, unknown>, fn: (helpers: StepHelpers) => Promise<T>): Promise<T>
  /** Read-only convenience: load the job row (e.g. for input). */
  job(): Promise<JobRow>
  /** Persist progressive output on the job — handy for long-running runs. */
  setJobOutput(output: Record<string, unknown>): Promise<void>
}

export interface StepHelpers {
  /** Attach cost/model metadata to the current run. Most agents call this
   *  immediately after each AI call. */
  cost(c: RunCost): void
  /** Update the step's input record with extra context (e.g. resolved
   *  lead-id from a free-text input). Visible in the Agents UI. */
  setInput(extra: Record<string, unknown>): void
}

export interface JobRow {
  id: string
  agent_kind: string
  status: string
  autonomy: Autonomy
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  lead_id: string | null
  company_id: string | null
}

interface RunRow {
  id: string
  status: string
  output: Record<string, unknown> | null
  edited_output: Record<string, unknown> | null
}

const APPROVAL_POLL_MS = 5000
const APPROVAL_TIMEOUT_MS = 60 * 60 * 1000  // 1 hour

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'agent-runtime', ...extra, time: new Date().toISOString() }))
}

export async function resolveAutonomy(agentKind: string): Promise<Autonomy> {
  const { data } = await supabase
    .from('crm_runtime_settings')
    .select('agent_autonomy_default, agent_autonomy_overrides')
    .eq('id', 1)
    .maybeSingle()
  const row = data as { agent_autonomy_default: Autonomy; agent_autonomy_overrides: Record<string, Autonomy> } | null
  if (!row) return 'approval'
  const override = row.agent_autonomy_overrides?.[agentKind]
  return override ?? row.agent_autonomy_default ?? 'approval'
}

/**
 * Build the agent context that an agent function calls into. The job
 * row's autonomy was already resolved + persisted by `runJob` so the
 * mode can't change mid-flight.
 */
export function buildContext(job: JobRow): AgentContext {
  let stepNo = 0

  return {
    jobId: job.id,
    agentKind: job.agent_kind,
    autonomy: job.autonomy,

    async job(): Promise<JobRow> {
      const { data } = await supabase
        .from('crm_agent_jobs')
        .select('id, agent_kind, status, autonomy, input, output, lead_id, company_id')
        .eq('id', job.id)
        .maybeSingle()
      return data as JobRow
    },

    async setJobOutput(output: Record<string, unknown>): Promise<void> {
      await supabase.from('crm_agent_jobs').update({ output }).eq('id', job.id)
    },

    async step<T>(
      name: string,
      input: Record<string, unknown>,
      fn: (helpers: StepHelpers) => Promise<T>,
    ): Promise<T> {
      stepNo += 1
      const stepIndex = stepNo
      let cost: RunCost = {}
      let extraInput: Record<string, unknown> = {}

      // Manual mode: don't run the step. The operator does the equivalent
      // action in the regular module UI; we record an explicit
      // 'manual_required' run row so the Audit timeline shows the gap.
      if (job.autonomy === 'manual') {
        const { data } = await supabase
          .from('crm_agent_runs')
          .insert({
            job_id: job.id, step_no: stepIndex, step_name: name,
            status: 'manual_required',
            input,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
          })
          .select('id')
          .maybeSingle()
        const runId = (data as { id: string } | null)?.id ?? ''
        await supabase.from('crm_agent_jobs')
          .update({ status: 'paused' })
          .eq('id', job.id)
        throw new StepHalted('manual_required', runId)
      }

      // Insert the running row.
      const { data: runRow } = await supabase
        .from('crm_agent_runs')
        .insert({
          job_id: job.id, step_no: stepIndex, step_name: name,
          status: 'running', input,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .maybeSingle()
      const runId = (runRow as { id: string } | null)?.id ?? ''

      let output: T
      try {
        output = await fn({
          cost(c: RunCost) { cost = { ...cost, ...c } },
          setInput(extra: Record<string, unknown>) { extraInput = { ...extraInput, ...extra } },
        })
      } catch (err) {
        const message = (err as Error).message
        await supabase.from('crm_agent_runs').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: message.slice(0, 500),
          input: { ...input, ...extraInput },
        }).eq('id', runId)
        throw err
      }

      // Auto mode: persist + return immediately.
      if (job.autonomy === 'auto') {
        await supabase.from('crm_agent_runs').update({
          status: 'done',
          output: serialise(output),
          finished_at: new Date().toISOString(),
          input: { ...input, ...extraInput },
          ...cost,
        }).eq('id', runId)
        return output
      }

      // Approval mode: wait for the operator to flip the row.
      await supabase.from('crm_agent_runs').update({
        status: 'awaiting_approval',
        output: serialise(output),
        input: { ...input, ...extraInput },
        ...cost,
      }).eq('id', runId)
      await supabase.from('crm_agent_jobs')
        .update({ status: 'awaiting_approval' })
        .eq('id', job.id)

      log('info', 'awaiting approval', { jobId: job.id, runId, step: name })
      const decision = await pollForDecision(runId)
      if (decision.status === 'approved') {
        await supabase.from('crm_agent_runs').update({
          status: 'done',
          finished_at: new Date().toISOString(),
        }).eq('id', runId)
        await supabase.from('crm_agent_jobs').update({ status: 'running' }).eq('id', job.id)
        // The operator may have edited the output — return whichever is set.
        const finalOut = (decision.edited_output ?? decision.output ?? null) as T | null
        return (finalOut ?? output) as T
      }
      // rejected
      await supabase.from('crm_agent_jobs').update({
        status: 'cancelled',
        finished_at: new Date().toISOString(),
      }).eq('id', job.id)
      throw new StepHalted('rejected', runId)
    },
  }
}

async function pollForDecision(runId: string): Promise<RunRow> {
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, APPROVAL_POLL_MS))
    const { data } = await supabase
      .from('crm_agent_runs')
      .select('id, status, output, edited_output')
      .eq('id', runId)
      .maybeSingle()
    const row = data as RunRow | null
    if (!row) continue
    if (row.status === 'approved' || row.status === 'rejected') return row
  }
  // Timed out — mark cancelled.
  await supabase.from('crm_agent_runs').update({
    status: 'rejected',
    error: 'approval timed out',
    finished_at: new Date().toISOString(),
  }).eq('id', runId)
  return { id: runId, status: 'rejected', output: null, edited_output: null }
}

function serialise(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return {}
  if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return { value: v }
}
