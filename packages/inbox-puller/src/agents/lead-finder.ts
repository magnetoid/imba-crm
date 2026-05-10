// lead-finder agent
// Input:  { actor_id, actor_input, max_save?: 50, auto_enrich?: boolean }
// Steps:
//   1. run-actor       — Apify actor produces dataset items
//   2. dedupe          — drop rows whose domain is already in crm_companies
//   3. save-leads      — insert crm_companies + crm_leads rows
//   4. (optional) enqueue-enrichment — fan out lead-enricher jobs

import type { AgentContext, JobRow } from './runtime.js'
import { supabase, loadProviderCredential } from '../supabase.js'
import { runApifyActor } from '@imba/shared/integrations/apify'

interface ScrapedRow {
  email?: string
  emails?: string[]                 // google-maps-scraper returns plural
  name?: string
  fullName?: string
  firstName?: string
  lastName?: string
  company?: string
  companyName?: string
  title?: string                    // also reused by GMaps for business name
  domain?: string
  website?: string
  url?: string                      // GMaps generic url field
  linkedinUrl?: string
  profileUrl?: string
  jobTitle?: string
  phone?: string
  phoneNumber?: string
  phoneNumbers?: string[]
  address?: string
  city?: string
  countryCode?: string
  categoryName?: string             // GMaps category, e.g. "Dentist"
  totalScore?: number               // GMaps rating
  reviewsCount?: number
  description?: string
  location?: { lat?: number; lng?: number }
}

function pickDomain(row: ScrapedRow): string | null {
  const candidate = row.domain || row.website || row.url || ''
  if (!candidate) return null
  try { return new URL(candidate).host.replace(/^www\./, '') } catch { return candidate.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '') || null }
}

function pickName(row: ScrapedRow): string | null {
  return row.name || row.fullName ||
    [row.firstName, row.lastName].filter(Boolean).join(' ') || null
}

function pickEmail(row: ScrapedRow): string | null {
  if (row.email) return row.email
  if (Array.isArray(row.emails) && row.emails.length > 0) return row.emails[0]
  return null
}

function pickPhone(row: ScrapedRow): string | null {
  if (row.phone) return row.phone
  if (row.phoneNumber) return row.phoneNumber
  if (Array.isArray(row.phoneNumbers) && row.phoneNumbers.length > 0) return row.phoneNumbers[0]
  return null
}

function pickCompany(row: ScrapedRow): string | null {
  // GMaps puts the business name in `title`. Fall back to companyName/company/domain.
  return row.companyName || row.company || row.title || null
}

export async function runLeadFinder(ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  const actorId    = (job.input.actor_id    as string)               ?? 'apify/web-scraper'
  const actorInput = (job.input.actor_input as Record<string, unknown>) ?? {}
  const maxSave    = Math.min(200, (job.input.max_save as number) ?? 50)
  const autoEnrich = (job.input.auto_enrich as boolean) ?? false

  // ── Step 1: run the Apify actor ─────────────────────────────────
  const items = await ctx.step('run-actor', { actor_id: actorId }, async () => {
    const cred = await loadProviderCredential('apify')
    if (!cred?.apiKey) throw new Error('apify provider credential not configured')
    const run = await runApifyActor<ScrapedRow>(cred, {
      actorId,
      input: actorInput,
      timeoutSeconds: 600,
      maxItems: maxSave * 2,
    })
    if (run.status !== 'SUCCEEDED') throw new Error(`apify run ${run.status}`)
    return run.items
  })

  // ── Step 2: dedupe by domain ────────────────────────────────────
  const fresh = await ctx.step('dedupe', { count_in: items.length }, async () => {
    const seen = new Set<string>()
    const out: ScrapedRow[] = []
    for (const row of items) {
      const domain = pickDomain(row)
      const key = (row.email || domain || row.linkedinUrl || row.profileUrl || '').toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(row)
      if (out.length >= maxSave) break
    }
    if (out.length === 0) return []
    // Cross-check against existing companies — drop where domain already known.
    const domains = out.map(pickDomain).filter(Boolean) as string[]
    if (domains.length === 0) return out
    const { data: existing } = await supabase
      .from('crm_companies')
      .select('domain')
      .in('domain', domains)
    const knownDomains = new Set(((existing as Array<{ domain: string }> | null) ?? []).map(r => r.domain.toLowerCase()))
    return out.filter(r => {
      const d = pickDomain(r)
      return !d || !knownDomains.has(d.toLowerCase())
    })
  })

  // ── Step 3: save to crm_companies + crm_leads ───────────────────
  const saved = await ctx.step('save-leads', { count_to_save: (fresh as ScrapedRow[]).length }, async () => {
    const created = { companies: 0, leads: 0, lead_ids: [] as string[] }
    for (const row of fresh as ScrapedRow[]) {
      const domain      = pickDomain(row)
      const companyName = pickCompany(row) ?? domain
      let companyId: string | null = null
      if (domain) {
        const { data: comp } = await supabase
          .from('crm_companies')
          .upsert({
            name: companyName ?? domain,
            domain,
            linkedin_url: row.linkedinUrl,
          }, { onConflict: 'domain' })
          .select('id')
          .maybeSingle()
        companyId = (comp as { id: string } | null)?.id ?? null
        if (companyId) created.companies++
      }
      const name    = pickName(row)
      const email   = pickEmail(row)
      const phone   = pickPhone(row)
      const website = row.website ?? row.url ?? (domain ? `https://${domain}` : null)
      const notesParts: string[] = []
      if (row.categoryName)              notesParts.push(`Category: ${row.categoryName}`)
      if (row.totalScore)                notesParts.push(`Rating: ${row.totalScore}${row.reviewsCount ? ` (${row.reviewsCount} reviews)` : ''}`)
      if (row.address)                   notesParts.push(`Address: ${row.address}`)
      if (row.description)               notesParts.push(row.description)

      const { data: inserted, error: leadErr } = await supabase
        .from('crm_leads')
        .insert({
          name: name ?? companyName ?? '(unnamed)',
          email,
          phone,
          website,
          company: companyName,
          company_id: companyId,
          linkedin_url: row.linkedinUrl ?? row.profileUrl ?? null,
          title: row.jobTitle ?? null,
          notes: notesParts.length > 0 ? notesParts.join(' | ') : null,
          source: 'lead-finder',
          stage: 'new',
        })
        .select('id')
        .maybeSingle()
      if (!leadErr && inserted) {
        created.leads++
        created.lead_ids.push((inserted as { id: string }).id)
      }
    }
    return created
  })

  // ── Step 4 (optional): fan-out lead-enricher jobs ────────────────
  // The enricher hits Hunter (verified email) + Apollo (title/phone) so a
  // smart-search batch ships with real contact info, not just a domain.
  let enrichmentEnqueued = 0
  if (autoEnrich && Array.isArray((saved as { lead_ids?: string[] }).lead_ids)) {
    const leadIds = (saved as { lead_ids: string[] }).lead_ids
    if (leadIds.length > 0) {
      await ctx.step('enqueue-enrichment', { count: leadIds.length }, async () => {
        const rows = leadIds.map(id => ({
          agent_kind: 'lead-enricher',
          input: {},
          lead_id: id,
          triggered_by: `lead-finder:${job.id}`,
        }))
        const { error } = await supabase.from('crm_agent_jobs').insert(rows)
        if (error) throw new Error(error.message)
        enrichmentEnqueued = leadIds.length
        return { enqueued: leadIds.length }
      })
    }
  }

  return {
    items_scraped: items.length,
    fresh: (fresh as unknown[]).length,
    saved,
    enrichment_enqueued: enrichmentEnqueued,
  }
}
