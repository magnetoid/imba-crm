// Phase 10.3 — Signal watchers. Each one polls an external source
// (Apify, Tavily, BuiltWith) on a slow cadence and inserts into
// crm_signals. The route_signal() postgres trigger then fans the
// signal out to the right downstream agent / sequence / alert.
//
// Watcher cadences are intentionally slow — rate-limited APIs +
// signals don't change minute-to-minute:
//
//   - Crunchbase funding scan        : every 24h
//   - LinkedIn hiring scan           : every 24h
//   - Tavily news scan               : every 12h
//   - BuiltWith tech-stack snapshot  : every 30 days (only if enabled)
//
// We pick `signal_poll_companies_per_run` companies per cycle, oldest-
// first by last poll timestamp, so the work spreads across days.

import { supabase, loadProviderCredential } from '../supabase.js'
import { runApifyActor } from '@imba/shared/integrations/apify'

interface WatcherSettings {
  signals_enabled: boolean
  signal_poll_companies_per_run: number
  signal_crunchbase_actor: string
  signal_linkedin_jobs_actor: string
  signal_builtwith_enabled: boolean
}

interface CompanyRow {
  id: string
  name: string
  domain: string | null
  linkedin_url: string | null
  enrichment: Record<string, unknown> | null
  tech_stack: Record<string, unknown> | null
  research: Record<string, unknown> | null
  research_at: string | null
}

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, source: 'signal-watcher', ...extra, time: new Date().toISOString() }))
}

async function loadSettings(): Promise<WatcherSettings | null> {
  const { data } = await supabase
    .from('crm_runtime_settings')
    .select('signals_enabled, signal_poll_companies_per_run, signal_crunchbase_actor, signal_linkedin_jobs_actor, signal_builtwith_enabled')
    .eq('id', 1).maybeSingle()
  return (data as WatcherSettings | null) ?? null
}

// State — last-run timestamps stored on the settings row to survive restarts.
async function getCheckpoint(key: string): Promise<number> {
  const { data } = await supabase.from('crm_ai_settings').select('value').eq('key', key).maybeSingle()
  const row = data as { value: { ts?: number } } | null
  return row?.value?.ts ?? 0
}
async function setCheckpoint(key: string, ts: number) {
  await supabase.from('crm_ai_settings').upsert({ key, value: { ts } })
}

// Pick N companies whose last research/poll is oldest, biased toward leads
// with at least one assigned crm_leads row (otherwise it's a vendor we
// scraped but never imported as a prospect).
async function pickCompaniesToPoll(n: number, sinceCheckpointKey: string): Promise<CompanyRow[]> {
  const { data } = await supabase
    .from('crm_companies')
    .select('id, name, domain, linkedin_url, enrichment, tech_stack, research, research_at, crm_leads(id)')
    .order('research_at', { ascending: true, nullsFirst: true })
    .limit(n)
  void sinceCheckpointKey
  const rows = (data as Array<CompanyRow & { crm_leads: Array<{ id: string }> }> | null) ?? []
  return rows.filter(r => (r.crm_leads ?? []).length > 0)
}

async function ensureLeadIdForCompany(companyId: string): Promise<string | null> {
  const { data } = await supabase.from('crm_leads')
    .select('id').eq('company_id', companyId).order('created_at').limit(1).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

// ── Crunchbase funding watcher ──────────────────────────────────────
async function watchCrunchbase(s: WatcherSettings) {
  const cred = await loadProviderCredential('apify')
  if (!cred?.apiKey) return  // silently skip if no Apify key
  const companies = await pickCompaniesToPoll(s.signal_poll_companies_per_run, 'sig_cp_cb')
  if (companies.length === 0) return

  // The Crunchbase Apify actor accepts startUrls — point it at the
  // company's crunchbase URL if we have one; otherwise skip.
  const startUrls = companies
    .map(c => {
      const e = (c.enrichment ?? {}) as { crunchbase_url?: string }
      return e.crunchbase_url ? { url: e.crunchbase_url } : null
    })
    .filter((x): x is { url: string } => !!x)
  if (startUrls.length === 0) return

  try {
    const run = await runApifyActor<{ name?: string; lastFundingType?: string; lastFundingAt?: string; lastFundingAmount?: number; lastFundingCurrency?: string; url?: string }>(
      cred,
      { actorId: s.signal_crunchbase_actor, input: { startUrls }, waitForFinish: 600 },
    )
    if (run.status !== 'SUCCEEDED') return
    for (const item of run.items.slice(0, 200)) {
      if (!item.lastFundingAt || !item.url) continue
      const company = companies.find(c => {
        const e = (c.enrichment ?? {}) as { crunchbase_url?: string }
        return e.crunchbase_url && item.url && (e.crunchbase_url.includes(item.url) || item.url.includes(e.crunchbase_url))
      })
      if (!company) continue
      const leadId = await ensureLeadIdForCompany(company.id)
      const dedup = `${company.id}:${item.lastFundingAt}`
      await supabase.from('crm_signals').insert({
        lead_id: leadId, company_id: company.id,
        kind: 'funding_announced',
        source: 'crunchbase',
        headline: `${item.lastFundingType ?? 'Funding'} round${item.lastFundingAmount ? ` of ${item.lastFundingAmount}` : ''}`,
        url: item.url, payload: item, dedup_key: dedup,
      }).select('id').maybeSingle()
    }
  } catch (err) {
    log('warn', 'crunchbase watcher failed', { error: (err as Error).message })
  }
}

// ── LinkedIn hiring watcher ──────────────────────────────────────────
async function watchLinkedInJobs(s: WatcherSettings) {
  const cred = await loadProviderCredential('apify')
  if (!cred?.apiKey) return
  const companies = await pickCompaniesToPoll(s.signal_poll_companies_per_run, 'sig_cp_li')
  if (companies.length === 0) return

  const startUrls = companies
    .filter(c => c.linkedin_url)
    .map(c => ({ url: `${c.linkedin_url}/jobs/` }))
  if (startUrls.length === 0) return

  // Roles we treat as buying-intent: revenue / marketing / GTM ops.
  const HOT_KEYWORDS = ['marketing', 'sales', 'sdr', 'bdr', 'revops', 'growth', 'demand', 'video', 'content']

  try {
    const run = await runApifyActor<{ companyUrl?: string; title?: string; postedAt?: string; jobUrl?: string }>(
      cred,
      { actorId: s.signal_linkedin_jobs_actor, input: { startUrls, scrapeJobsCount: 20 }, waitForFinish: 600 },
    )
    if (run.status !== 'SUCCEEDED') return
    for (const item of run.items.slice(0, 500)) {
      if (!item.title || !item.companyUrl) continue
      const t = item.title.toLowerCase()
      if (!HOT_KEYWORDS.some(k => t.includes(k))) continue
      const company = companies.find(c => c.linkedin_url && item.companyUrl?.includes(c.linkedin_url))
      if (!company) continue
      const leadId = await ensureLeadIdForCompany(company.id)
      const dedup = `${company.id}:${item.jobUrl ?? item.title}`
      await supabase.from('crm_signals').insert({
        lead_id: leadId, company_id: company.id,
        kind: 'hiring_post', source: 'apify-linkedin-jobs',
        headline: `Hiring: ${item.title.slice(0, 80)}`,
        url: item.jobUrl ?? null, payload: item, dedup_key: dedup,
      })
    }
  } catch (err) {
    log('warn', 'linkedin-jobs watcher failed', { error: (err as Error).message })
  }
}

// ── Tavily news watcher ──────────────────────────────────────────────
async function watchTavilyNews(s: WatcherSettings) {
  const cred = await loadProviderCredential('tavily')
  if (!cred?.apiKey) return
  const companies = await pickCompaniesToPoll(s.signal_poll_companies_per_run, 'sig_cp_tv')
  if (companies.length === 0) return

  for (const c of companies) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: cred.apiKey,
          query: `"${c.name}" news 2026`,
          max_results: 3,
          search_depth: 'basic',
          topic: 'news',
        }),
      })
      if (!res.ok) continue
      const json = await res.json() as { results?: Array<{ title?: string; url?: string; published_date?: string; content?: string }> }
      const results = json.results ?? []
      const leadId = await ensureLeadIdForCompany(c.id)
      for (const r of results) {
        if (!r.url || !r.title) continue
        const dedup = `${c.id}:${r.url}`
        await supabase.from('crm_signals').insert({
          lead_id: leadId, company_id: c.id,
          kind: 'news_mention', source: 'tavily',
          headline: r.title.slice(0, 200), url: r.url,
          payload: r, dedup_key: dedup,
        })
      }
    } catch (err) {
      log('warn', 'tavily watcher failed for company', { company: c.name, error: (err as Error).message })
    }
  }
}

// ── BuiltWith tech-stack diff watcher ────────────────────────────────
async function watchBuiltWith(s: WatcherSettings) {
  if (!s.signal_builtwith_enabled) return
  const cred = await loadProviderCredential('browserbase')   // we reuse browserbase's extra.builtwith_key field as a stash
  // BuiltWith key isn't whitelisted as its own provider — keep it in
  // crm_provider_credentials.extra.builtwith_key on the 'browserbase' row.
  const builtwithKey = (cred?.extra as { builtwith_key?: string } | undefined)?.builtwith_key
  if (!builtwithKey) return

  const companies = await pickCompaniesToPoll(Math.min(10, s.signal_poll_companies_per_run), 'sig_cp_bw')
  if (companies.length === 0) return

  for (const c of companies) {
    if (!c.domain) continue
    try {
      const res = await fetch(`https://api.builtwith.com/v21/api.json?KEY=${builtwithKey}&LOOKUP=${encodeURIComponent(c.domain)}`)
      if (!res.ok) continue
      const json = await res.json() as { Results?: Array<{ Result?: { Paths?: Array<{ Technologies?: Array<{ Name?: string }> }> } }> }
      const techs = new Set<string>()
      for (const r of json.Results ?? []) for (const p of r.Result?.Paths ?? []) for (const t of p.Technologies ?? []) {
        if (t.Name) techs.add(t.Name)
      }
      const prev = (c.tech_stack ?? {}) as Record<string, true>
      const prevSet = new Set(Object.keys(prev))
      const added = Array.from(techs).filter(t => !prevSet.has(t))
      const removed = Array.from(prevSet).filter(t => !techs.has(t))
      const leadId = await ensureLeadIdForCompany(c.id)
      const today = new Date().toISOString().slice(0, 10)

      for (const t of added.slice(0, 15)) {
        await supabase.from('crm_signals').insert({
          lead_id: leadId, company_id: c.id,
          kind: 'tech_added', source: 'builtwith',
          headline: `Added ${t}`,
          payload: { tech: t },
          dedup_key: `${c.id}:add:${t}:${today}`,
        })
      }
      for (const t of removed.slice(0, 15)) {
        await supabase.from('crm_signals').insert({
          lead_id: leadId, company_id: c.id,
          kind: 'tech_removed', source: 'builtwith',
          headline: `Removed ${t}`,
          payload: { tech: t },
          dedup_key: `${c.id}:rem:${t}:${today}`,
        })
      }
      // Persist the new snapshot for next diff.
      const nextStack: Record<string, true> = {}
      for (const t of techs) nextStack[t] = true
      await supabase.from('crm_companies').update({ tech_stack: nextStack }).eq('id', c.id)
    } catch (err) {
      log('warn', 'builtwith watcher failed for company', { domain: c.domain, error: (err as Error).message })
    }
  }
}

// ── Public entry: called from the worker tick. Each watcher checks
//    its own checkpoint so we don't re-poll every cycle.
const ONE_HOUR = 3600_000
const TWELVE_HOURS = 12 * ONE_HOUR
const ONE_DAY = 24 * ONE_HOUR
const THIRTY_DAYS = 30 * ONE_DAY

export async function runSignalWatchers(): Promise<void> {
  const settings = await loadSettings()
  if (!settings || !settings.signals_enabled) return
  const now = Date.now()

  const cb = await getCheckpoint('signal_watcher_crunchbase')
  if (now - cb > ONE_DAY) {
    await watchCrunchbase(settings)
    await setCheckpoint('signal_watcher_crunchbase', now)
  }

  const li = await getCheckpoint('signal_watcher_linkedin_jobs')
  if (now - li > ONE_DAY) {
    await watchLinkedInJobs(settings)
    await setCheckpoint('signal_watcher_linkedin_jobs', now)
  }

  const tv = await getCheckpoint('signal_watcher_tavily')
  if (now - tv > TWELVE_HOURS) {
    await watchTavilyNews(settings)
    await setCheckpoint('signal_watcher_tavily', now)
  }

  if (settings.signal_builtwith_enabled) {
    const bw = await getCheckpoint('signal_watcher_builtwith')
    if (now - bw > THIRTY_DAYS) {
      await watchBuiltWith(settings)
      await setCheckpoint('signal_watcher_builtwith', now)
    }
  }
}
