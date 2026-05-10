// deal-health-scorer agent
// Input:  { lead_id }   (or no lead_id → score all active leads)
// Steps:
//   1. compute     — pure SQL: stage age, last activity, response ratio
//   2. update-lead — set deal_health + deal_health_reason
//
// Runs in 'auto' mode (no human in the loop). Triggered nightly by a
// cron-style sweep, or per-lead when a stage change happens.
//
// Heuristics (tuned for SMB sales cycles):
//   - red    : stage age >21d AND no inbound activity in 14d
//   - red    : stage age >40d in any non-terminal stage
//   - yellow : stage age >14d AND zero responses on outreach
//   - yellow : last_contacted_at >14d ago
//   - green  : default (recent activity OR fresh stage entry)
//   - terminal stages (won/lost) are always green
//
// Picks a single short reason string so the operator can see *why*
// at a glance on the pipeline card.

import type { AgentContext, JobRow } from './runtime.js'
import { supabase } from '../supabase.js'

interface LeadRow {
  id: string
  stage: string
  stage_entered_at: string | null
  last_contacted_at: string | null
  created_at: string
}

type Health = 'green' | 'yellow' | 'red'

const TERMINAL = new Set(['won', 'lost'])

export async function runDealHealthScorer(_ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  // Single-lead path (triggered from a lead stage change).
  if (job.lead_id) {
    const result = await scoreOne(job.lead_id)
    return { mode: 'single', ...result }
  }

  // Sweep path (cron). Score every non-terminal lead at most once per run.
  const { data } = await supabase
    .from('crm_leads')
    .select('id')
    .not('stage', 'in', '(won,lost)')
    .limit(500)
  const ids = ((data as Array<{ id: string }> | null) ?? []).map(r => r.id)
  let red = 0, yellow = 0, green = 0
  for (const id of ids) {
    const r = await scoreOne(id)
    if (r.health === 'red') red++
    else if (r.health === 'yellow') yellow++
    else green++
  }
  return { mode: 'sweep', scored: ids.length, red, yellow, green }
}

async function scoreOne(leadId: string): Promise<{ health: Health; reason: string }> {
  const { data } = await supabase
    .from('crm_leads')
    .select('id, stage, stage_entered_at, last_contacted_at, created_at')
    .eq('id', leadId)
    .maybeSingle()
  const lead = data as LeadRow | null
  if (!lead) return { health: 'green', reason: 'lead not found' }

  if (TERMINAL.has(lead.stage)) {
    await persist(leadId, 'green', `terminal: ${lead.stage}`)
    return { health: 'green', reason: `terminal: ${lead.stage}` }
  }

  const stageAgeDays = ageDays(lead.stage_entered_at ?? lead.created_at)
  const lastContactDays = ageDays(lead.last_contacted_at ?? lead.created_at)

  // Look at recent activity to confirm or contradict the "rotting" signal.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400_000).toISOString()
  const { count: inboundCount } = await supabase
    .from('crm_inbox_messages')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('direction', 'inbound')
    .gte('received_at', fourteenDaysAgo)

  const { data: attempts } = await supabase
    .from('crm_outreach_attempts')
    .select('id, sent_at, responded_at')
    .eq('lead_id', leadId)
  const sent = (attempts as Array<{ sent_at: string | null; responded_at: string | null }> | null) ?? []
  const totalSent = sent.filter(a => a.sent_at).length
  const totalResponded = sent.filter(a => a.responded_at).length

  let health: Health = 'green'
  let reason = `Active in ${lead.stage} for ${Math.round(stageAgeDays)}d`

  if (stageAgeDays > 40) {
    health = 'red'; reason = `${Math.round(stageAgeDays)}d in ${lead.stage} — likely stalled`
  } else if (stageAgeDays > 21 && (inboundCount ?? 0) === 0) {
    health = 'red'; reason = `${Math.round(stageAgeDays)}d in ${lead.stage}, no inbound for 14d+`
  } else if (totalSent >= 4 && totalResponded === 0) {
    health = 'red'; reason = `${totalSent} touches, zero responses`
  } else if (stageAgeDays > 14 && totalResponded === 0 && totalSent > 0) {
    health = 'yellow'; reason = `${Math.round(stageAgeDays)}d in stage, no response yet`
  } else if (lastContactDays > 14) {
    health = 'yellow'; reason = `Last touch ${Math.round(lastContactDays)}d ago`
  } else if ((inboundCount ?? 0) > 0) {
    health = 'green'; reason = `${inboundCount} inbound in last 14d`
  }

  await persist(leadId, health, reason)
  return { health, reason }
}

async function persist(leadId: string, health: Health, reason: string) {
  await supabase
    .from('crm_leads')
    .update({ deal_health: health, deal_health_reason: reason.slice(0, 200) })
    .eq('id', leadId)
}

function ageDays(iso: string | null): number {
  if (!iso) return 0
  return (Date.now() - new Date(iso).getTime()) / 86400_000
}
