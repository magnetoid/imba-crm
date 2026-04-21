import { supabase } from '@/lib/supabase'
import { buildCompanyContext, callAIJSON, getCRMRuntimeSettings } from '@/lib/ai'

// ─────────────────────────────────────────────────────────
// Template interpolation — replaces {{placeholders}} with lead data
// ─────────────────────────────────────────────────────────
export interface TemplateLead {
  name?: string
  company?: string
  email?: string
  service_interest?: string
  budget_range?: string
  phone?: string
  website?: string
}

export function interpolateTemplate(text: string, lead: TemplateLead): string {
  if (!text) return ''
  return text
    .replace(/\{\{\s*name\s*\}\}/g, lead.name || '')
    .replace(/\{\{\s*company\s*\}\}/g, lead.company || '')
    .replace(/\{\{\s*email\s*\}\}/g, lead.email || '')
    .replace(/\{\{\s*service_interest\s*\}\}/g, lead.service_interest || '')
    .replace(/\{\{\s*budget\s*\}\}/g, lead.budget_range || '')
    .replace(/\{\{\s*phone\s*\}\}/g, lead.phone || '')
    .replace(/\{\{\s*website\s*\}\}/g, lead.website || '')
}

export async function incrementTemplateUseCount(id: string) {
  try {
    const { data } = await supabase.from('crm_templates').select('use_count').eq('id', id).maybeSingle()
    await supabase.from('crm_templates').update({ use_count: (data?.use_count || 0) + 1 }).eq('id', id)
  } catch (e) {
    console.warn('Failed to increment template use_count:', e)
  }
}

// ─────────────────────────────────────────────────────────
// Activity auto-logging — connects outreach/proposals/invoices to lead timeline
// ─────────────────────────────────────────────────────────
export async function logActivity(
  leadId: string,
  type: 'note' | 'email' | 'call' | 'meeting' | 'proposal' | 'follow_up' | 'invoice',
  subject: string,
  body: string = ''
) {
  try {
    await supabase.from('crm_activities').insert([{
      lead_id: leadId, type, subject, body, created_by: 'system',
    }])
    if (['email', 'call', 'meeting'].includes(type)) {
      await supabase.from('crm_leads').update({ last_contacted_at: new Date().toISOString() }).eq('id', leadId)
    }
  } catch (e) {
    console.warn('Failed to log activity:', e)
  }
}

// ─────────────────────────────────────────────────────────
// Auto-score a lead with AI (uses server-side ai-proxy)
// ─────────────────────────────────────────────────────────
interface LeadForScoring {
  id: string
  name: string
  company?: string
  service_interest?: string
  budget_range?: string
  source: string
  notes?: string
}

export async function autoScoreLead(lead: LeadForScoring): Promise<{ score: number; notes: string } | null> {
  try {
    const runtime = await getCRMRuntimeSettings()
    const prompt = `You are a B2B sales expert. Score this lead 0-100 and give a concise follow-up recommendation.
${buildCompanyContext(runtime)}

Lead:
- Name: ${lead.name}
- Company: ${lead.company || 'Unknown'}
- Service interest: ${lead.service_interest || 'Unknown'}
- Budget: ${lead.budget_range || 'Unknown'}
- Source: ${lead.source}
- Notes: ${lead.notes || 'None'}

Return ONLY JSON: {"score": NUMBER, "notes": "2 sentence recommendation"}`

    const parsed = await callAIJSON<{ score: number; notes: string }>(prompt, { maxTokens: 400 })
    await supabase.from('crm_leads').update({
      ai_score: parsed.score,
      ai_notes: parsed.notes,
      last_ai_scored_at: new Date().toISOString(),
    }).eq('id', lead.id)
    return parsed
  } catch (e) {
    console.warn('Auto-scoring failed:', e)
    return null
  }
}

// ─────────────────────────────────────────────────────────
// Lead enrichment from website URL
// ─────────────────────────────────────────────────────────
interface EnrichmentResult {
  industry: string
  company_size: string
  likely_needs: string
  ai_summary: string
}

export async function enrichLeadFromWebsite(website: string, company?: string): Promise<EnrichmentResult | null> {
  if (!website) return null
  try {
    const runtime = await getCRMRuntimeSettings()
    const prompt = `You are a B2B research assistant. Based on the company name and website URL below, infer the most likely business details.
${buildCompanyContext(runtime)}

Company: ${company || 'Unknown'}
Website: ${website}

Return ONLY valid JSON with your best inference:
{
  "industry": "specific industry category",
  "company_size": "best guess e.g. 10-50, 50-200, 200+",
  "likely_needs": "what kind of video production they probably need and why",
  "ai_summary": "2-3 sentence opportunity summary for a video production agency"
}`

    return await callAIJSON<EnrichmentResult>(prompt, { maxTokens: 600 })
  } catch (e) {
    console.warn('Enrichment failed:', e)
    return null
  }
}

// ─────────────────────────────────────────────────────────
// Browser notifications for follow-up reminders
// ─────────────────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function showNotification(title: string, body: string, onClick?: () => void) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const notif = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'crm-followup',
  })
  if (onClick) notif.onclick = () => { window.focus(); onClick(); notif.close() }
}

// ─────────────────────────────────────────────────────────
// Revenue forecasting — weighted by deal probability and stage
// ─────────────────────────────────────────────────────────
const STAGE_WEIGHTS: Record<string, number> = {
  new: 0.1,
  qualified: 0.3,
  proposal: 0.5,
  negotiation: 0.75,
  won: 1.0,
  lost: 0,
}

export function forecastRevenue(leads: Array<{ stage: string; value?: number; probability?: number }>): {
  committed: number
  weighted: number
  pipeline: number
} {
  let committed = 0
  let weighted = 0
  let pipeline = 0

  for (const lead of leads) {
    const value = lead.value || 0
    if (lead.stage === 'won') {
      committed += value
      weighted += value
    } else if (lead.stage !== 'lost') {
      pipeline += value
      const stageWeight = STAGE_WEIGHTS[lead.stage] || 0.1
      const probWeight = (lead.probability ?? 50) / 100
      weighted += value * stageWeight * probWeight
    }
  }

  return {
    committed: Math.round(committed),
    weighted: Math.round(weighted),
    pipeline: Math.round(pipeline),
  }
}
