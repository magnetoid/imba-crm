// Dispatch loop. Polls crm_outreach_attempts for due 'queued' rows and
// hands them to the right channel. Runs once per worker tick alongside
// the inbox + outbound-mailer + agent loops.

import { supabase } from '../supabase.js'
import { emailChannel } from './email.js'
import { contactFormChannel } from './contact-form.js'
import { linkedinChannel } from './linkedin.js'
import type { Channel, ChannelInput } from './types.js'

const CHANNELS: Record<string, Channel> = {
  email:        emailChannel,
  contact_form: contactFormChannel,
  linkedin_dm:  linkedinChannel,
}

const BATCH = 10

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'dispatch', ...extra, time: new Date().toISOString() }))
}

interface AttemptRow {
  id: string
  lead_id: string
  channel: string
  metadata: Record<string, unknown>
}

interface LeadRow {
  id: string
  name: string | null
  email: string | null
  linkedin_url: string | null
  company: string | null
  company_id: string | null
}
interface CompanyRow { domain: string | null }

export async function dispatchAttempts() {
  const nowIso = new Date().toISOString()

  const { data: rows, error } = await supabase
    .from('crm_outreach_attempts')
    .select('id, lead_id, channel, metadata')
    .eq('status', 'queued')
    .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(BATCH)
  if (error) {
    log('error', 'failed to load due attempts', { error: error.message })
    return
  }
  const attempts = (rows as AttemptRow[] | null) ?? []
  if (attempts.length === 0) return

  for (const attempt of attempts) {
    const handler = CHANNELS[attempt.channel]
    if (!handler) {
      await markAttempt(attempt.id, 'failed', `unknown channel: ${attempt.channel}`)
      continue
    }
    // Optimistic claim — flip to 'running' so a parallel worker can't pick
    // the same row up.
    {
      const { error: claimErr } = await supabase
        .from('crm_outreach_attempts')
        .update({ status: 'running' })
        .eq('id', attempt.id)
        .eq('status', 'queued')
      if (claimErr) continue
    }

    // Hydrate lead + company info the channel needs.
    const { data: leadRow } = await supabase
      .from('crm_leads')
      .select('id, name, email, linkedin_url, company, company_id')
      .eq('id', attempt.lead_id)
      .maybeSingle()
    const lead = leadRow as LeadRow | null
    if (!lead) {
      await markAttempt(attempt.id, 'failed', 'lead not found')
      continue
    }
    let companyDomain: string | null = null
    if (lead.company_id) {
      const { data: company } = await supabase
        .from('crm_companies').select('domain').eq('id', lead.company_id).maybeSingle()
      companyDomain = (company as CompanyRow | null)?.domain ?? null
    }

    const md = attempt.metadata ?? {}
    const input: ChannelInput = {
      attemptId: attempt.id,
      leadId: lead.id,
      toEmail: lead.email,
      toName: lead.name,
      companyDomain,
      linkedinUrl: lead.linkedin_url,
      subject: (md.subject as string | undefined) ?? null,
      body: (md.body as string | undefined) ?? '',
      metadata: md,
    }
    if (!input.body) {
      await markAttempt(attempt.id, 'failed', 'attempt has empty body in metadata')
      continue
    }

    try {
      const result = await handler.send(input)
      await markAttempt(attempt.id, result.status, result.error, {
        ...md,
        ...(result.metadata ?? {}),
      })
      log('info', 'attempt dispatched', { id: attempt.id, channel: attempt.channel, status: result.status })
    } catch (err) {
      const message = (err as Error).message
      await markAttempt(attempt.id, 'failed', message)
      log('error', 'attempt threw', { id: attempt.id, channel: attempt.channel, error: message })
    }
  }
}

async function markAttempt(
  id: string,
  status: 'sent' | 'failed' | 'skipped',
  error?: string,
  metadata?: Record<string, unknown>,
) {
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'sent')      update.sent_at = new Date().toISOString()
  if (error)                  update.error = error.slice(0, 500)
  if (metadata)               update.metadata = metadata
  await supabase.from('crm_outreach_attempts').update(update).eq('id', id)
}
