// account-researcher agent (Phase 10.4)
//
// Pulls free-form research about a lead's company and stores a
// structured summary the outreach-drafter can quote. The 2026 research
// shows referencing-something-specific (recent press, key hire, blog
// post topic) lifts cold-email reply rates 3-5×; this agent provides
// the substrate.
//
// Input:  { lead_id }
// Steps:
//   1. load-context   — pull lead, company, recent signals
//   2. fetch-website  — grab homepage text + meta description
//   3. fetch-news     — Tavily search "<company> news 2026" (if Tavily
//                        is configured; falls back to skipping)
//   4. extract        — AI extracts a structured "company brief" with
//                        pitch hooks, objection risks, headline news
//   5. persist        — write to crm_companies.research jsonb
//                        + research_at timestamp
//
// Idempotent: if research_at is < 7 days old we skip (unless input
// has force=true).

import type { AgentContext, JobRow } from './runtime.js'
import { supabase, loadProviderCredential } from '../supabase.js'
import { callAIJSON, getAISettings } from '../ai.js'

interface CompanyResearch {
  ai_summary: string
  pitch_hooks: string[]
  objection_risks: string[]
  competitor_set: string[]
  headline_news: Array<{ title: string; url?: string; date?: string }>
  recent_blog_topics: string[]
  recent_signals: Array<{ kind: string; headline?: string; captured_at: string }>
  ai_model?: string
  computed_at: string
}

const STALE_AFTER_DAYS = 7
const MAX_HTML_CHARS = 40_000

export async function runAccountResearcher(_ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  if (!job.lead_id) throw new Error('lead_id missing')
  const force = !!job.input?.force

  const { data: leadData } = await supabase
    .from('crm_leads')
    .select('id, name, email, company, company_id')
    .eq('id', job.lead_id)
    .maybeSingle()
  const lead = leadData as { id: string; name: string; email: string | null; company: string | null; company_id: string | null } | null
  if (!lead?.company_id) throw new Error('lead has no company_id; enrich first')

  const { data: companyData } = await supabase
    .from('crm_companies')
    .select('id, name, domain, linkedin_url, industry, size, country, research, research_at')
    .eq('id', lead.company_id).maybeSingle()
  const company = companyData as { id: string; name: string; domain: string | null; linkedin_url: string | null; industry: string | null; size: string | null; country: string | null; research: Record<string, unknown> | null; research_at: string | null } | null
  if (!company) throw new Error(`company ${lead.company_id} not found`)

  if (!force && company.research_at) {
    const ageDays = (Date.now() - new Date(company.research_at).getTime()) / 86400_000
    if (ageDays < STALE_AFTER_DAYS) {
      return { skipped: true, reason: `research is ${ageDays.toFixed(1)}d old; use force=true to refresh` }
    }
  }

  // Recent signals on this lead — useful pitch hooks even if web fetch fails.
  const { data: sigs } = await supabase
    .from('crm_signals')
    .select('kind, headline, captured_at')
    .eq('company_id', company.id)
    .order('captured_at', { ascending: false })
    .limit(10)
  const recentSignals = ((sigs ?? []) as Array<{ kind: string; headline: string | null; captured_at: string }>)
    .map(s => ({ kind: s.kind, headline: s.headline ?? undefined, captured_at: s.captured_at }))

  // ── Step 2: pull homepage HTML (best-effort, swallow errors) ────────
  let homepageText = ''
  let metaDescription = ''
  if (company.domain) {
    try {
      const url = company.domain.startsWith('http') ? company.domain : `https://${company.domain}`
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) })
      if (res.ok) {
        const html = await res.text()
        homepageText = html.slice(0, MAX_HTML_CHARS)
        const m = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
        if (m) metaDescription = m[1]
      }
    } catch { /* network/timeout */ }
  }

  // Strip HTML to text the AI can chew through (rough but cheap).
  const stripped = homepageText
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)

  // ── Step 3: Tavily news (optional) ──────────────────────────────────
  let news: Array<{ title: string; url: string; published_date?: string; content?: string }> = []
  const tavily = await loadProviderCredential('tavily')
  if (tavily?.apiKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: tavily.apiKey,
          query: `"${company.name}" news 2026`,
          max_results: 5,
          search_depth: 'basic',
          topic: 'news',
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) {
        const json = await res.json() as { results?: Array<{ title?: string; url?: string; published_date?: string; content?: string }> }
        news = (json.results ?? []).filter(r => !!r.url && !!r.title)
          .map(r => ({ title: r.title!, url: r.url!, published_date: r.published_date, content: r.content?.slice(0, 800) }))
      }
    } catch { /* swallow */ }
  }

  // ── Step 4: AI extraction ──────────────────────────────────────────
  const aiSettings = await getAISettings()
  const prompt = `You are a senior B2B account researcher. Extract a structured "company brief" the SDR will use to personalise an outbound email.

Company:
  name:        ${company.name}
  domain:      ${company.domain ?? '(unknown)'}
  industry:    ${company.industry ?? '(unknown)'}
  size:        ${company.size ?? '(unknown)'}
  country:     ${company.country ?? '(unknown)'}

Meta description:
  ${metaDescription || '(none)'}

Homepage text (truncated):
"""
${stripped || '(no homepage data)'}
"""

Recent news:
${news.length === 0 ? '(none)' : news.map(n => `- "${n.title}" — ${n.published_date ?? 'undated'} — ${n.url}`).join('\n')}

Recent CRM signals (already captured):
${recentSignals.length === 0 ? '(none)' : recentSignals.slice(0, 5).map(s => `- ${s.kind}: ${s.headline ?? '(no headline)'} (${s.captured_at})`).join('\n')}

Return ONLY valid minified JSON in this shape:
{"ai_summary":"1-2 sentence summary","pitch_hooks":["specific opener like 'congrats on the Series B'"],"objection_risks":["e.g. 'they just renewed HubSpot'"],"competitor_set":["competitor names if obvious"],"headline_news":[{"title":"...","url":"...","date":"yyyy-mm-dd"}],"recent_blog_topics":["topic strings if visible on the homepage"]}`

  const result = await callAIJSON<Omit<CompanyResearch, 'computed_at' | 'recent_signals' | 'ai_model'>>({ userPrompt: prompt, maxTokens: 1200 })
  if (!result) throw new Error('AI extraction returned no result')

  const final: CompanyResearch = {
    ai_summary:         result.ai_summary ?? '',
    pitch_hooks:        Array.isArray(result.pitch_hooks)        ? result.pitch_hooks        : [],
    objection_risks:    Array.isArray(result.objection_risks)    ? result.objection_risks    : [],
    competitor_set:     Array.isArray(result.competitor_set)     ? result.competitor_set     : [],
    headline_news:      Array.isArray(result.headline_news)      ? result.headline_news      : [],
    recent_blog_topics: Array.isArray(result.recent_blog_topics) ? result.recent_blog_topics : [],
    recent_signals:     recentSignals,
    ai_model:           aiSettings?.active_ai_model,
    computed_at:        new Date().toISOString(),
  }

  await supabase.from('crm_companies').update({
    research: final,
    research_at: final.computed_at,
  }).eq('id', company.id)

  return {
    company_id: company.id,
    pitch_hooks: final.pitch_hooks.length,
    headline_news: final.headline_news.length,
    objection_risks: final.objection_risks.length,
  }
}
