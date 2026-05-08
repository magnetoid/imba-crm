import { supabase } from '@imba/shared/supabase'
import { buildCompanyContext, callAIJSON, getCRMRuntimeSettings } from '@imba/shared/lib/ai'
import { logGeneration, type AIFeature } from '@/lib/aiGenerations'

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface SiteAnalysis {
  id: string
  lead_id: string | null
  url: string
  domain: string
  status: 'pending' | 'crawling' | 'analyzing' | 'complete' | 'failed'
  error: string | null
  tech_stack: TechStack
  seo_audit: SEOAudit
  performance: PerformanceAudit
  content_audit: ContentAudit
  visual_audit: VisualAudit
  screenshots: Screenshot[]
  score_overall: number | null
  score_seo: number | null
  score_performance: number | null
  score_content: number | null
  score_visual: number | null
  ai_summary: string | null
  ai_opportunities: string | null
  ai_talking_points: string | null
  ai_competitor_notes: string | null
  crawled_at: string | null
  analyzed_at: string | null
  created_at: string
  created_by: string | null
  // Joined lead info (optional)
  lead?: { id: string; name: string; company: string; website: string } | null
}

export interface TechStack {
  cms?: string
  framework?: string
  analytics?: string[]
  ads?: string[]
  email_marketing?: string[]
  cdn?: string
  hosting?: string
  ecommerce?: string
  other?: string[]
}

export interface SEOAudit {
  has_meta_title?: boolean
  title_length?: number
  title_text?: string
  has_meta_description?: boolean
  description_length?: number
  description_text?: string
  has_og_image?: boolean
  has_og_title?: boolean
  has_og_description?: boolean
  has_canonical?: boolean
  has_robots_meta?: boolean
  has_structured_data?: boolean
  structured_data_types?: string[]
  h1_count?: number
  h1_texts?: string[]
  has_sitemap?: boolean
  has_robots_txt?: boolean
  issues?: string[]
}

export interface PerformanceAudit {
  speed_score?: number
  mobile_score?: number
  lcp_ms?: number
  cls?: number
  fid_ms?: number
  total_size_kb?: number
  request_count?: number
  issues?: string[]
}

export interface ContentAudit {
  page_count?: number
  avg_word_count?: number
  has_blog?: boolean
  blog_post_count?: number
  blog_frequency?: string
  video_count?: number
  video_sources?: string[]
  image_count?: number
  has_testimonials?: boolean
  has_case_studies?: boolean
  has_pricing?: boolean
  has_contact_form?: boolean
  social_links?: string[]
  cta_count?: number
}

export interface VisualAudit {
  colors?: string[]
  typography?: string
  design_era?: string
  responsive?: boolean
  dark_mode?: boolean
  animations?: boolean
  overall_impression?: string
}

export interface Screenshot {
  type: 'desktop' | 'mobile'
  url: string
}

// ─────────────────────────────────────────────────────────
// URL helpers
// ─────────────────────────────────────────────────────────

export function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  }
}

export function normalizeUrl(url: string): string {
  if (!url.startsWith('http')) url = `https://${url}`
  try {
    const u = new URL(url)
    return u.origin
  } catch {
    return url
  }
}

// ─────────────────────────────────────────────────────────
// Score helpers
// ─────────────────────────────────────────────────────────

export function scoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-amber-400'
  if (score >= 40) return 'text-orange-400'
  return 'text-red-400'
}

export function scoreBg(score: number | null): string {
  if (score === null) return 'bg-muted'
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

export function scoreLabel(score: number | null): string {
  if (score === null) return 'N/A'
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Needs Work'
  return 'Poor'
}

// ─────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────

export async function listAnalyses(limit = 50): Promise<SiteAnalysis[]> {
  const { data, error } = await supabase
    .from('site_analyses')
    .select('*, lead:crm_leads(id, name, company, website)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.warn('listAnalyses failed:', error.message)
    return []
  }
  return (data as SiteAnalysis[]) ?? []
}

export async function getAnalysis(id: string): Promise<SiteAnalysis | null> {
  const { data, error } = await supabase
    .from('site_analyses')
    .select('*, lead:crm_leads(id, name, company, website)')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.warn('getAnalysis failed:', error.message)
    return null
  }
  return data as SiteAnalysis | null
}

export async function deleteAnalysis(id: string): Promise<boolean> {
  const { error } = await supabase.from('site_analyses').delete().eq('id', id)
  if (error) {
    console.warn('deleteAnalysis failed:', error.message)
    return false
  }
  return true
}

// ─────────────────────────────────────────────────────────
// Main analysis pipeline
// ─────────────────────────────────────────────────────────

interface AnalyzeOptions {
  leadId?: string
  onStatusChange?: (status: string, detail?: string) => void
}

export async function analyzeSite(
  rawUrl: string,
  options?: AnalyzeOptions,
): Promise<SiteAnalysis | null> {
  const url = normalizeUrl(rawUrl)
  const domain = extractDomain(url)

  const userRes = await supabase.auth.getUser()
  const userId = userRes.data.user?.id ?? null

  // 1. Create pending record
  options?.onStatusChange?.('pending', 'Creating analysis record…')
  const { data: row, error: insertErr } = await supabase
    .from('site_analyses')
    .insert({
      url,
      domain,
      lead_id: options?.leadId ?? null,
      status: 'crawling',
      created_by: userId,
    })
    .select('*')
    .single()

  if (insertErr || !row) {
    console.error('Failed to create analysis:', insertErr)
    return null
  }

  const analysisId = row.id

  try {
    // 2. Fetch the site HTML
    options?.onStatusChange?.('crawling', 'Fetching website HTML…')
    let html = ''
    try {
      // Use the model-router's /api/analyze-site endpoint if available,
      // otherwise fall back to a CORS-friendly proxy or direct fetch.
      const proxyRes = await fetch('/api/ai/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: {
            type: 'reasoning',
            messages: [{ role: 'user', content: `Fetch and analyze this website: ${url}\n\nI need you to visit ${url} and analyze its HTML/content. Based on publicly available information about this domain and typical websites in this space, provide a comprehensive analysis.\n\nReturn ONLY valid JSON with this structure:\n${JSON.stringify(getAnalysisSchema(), null, 2)}` }],
          },
        }),
      })
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json()
        html = proxyData.data?.content || ''
      }
    } catch {
      // Proxy unavailable — continue with AI-only analysis
    }

    // 3. AI analysis (the core of v1 — AI infers from domain knowledge)
    options?.onStatusChange?.('analyzing', 'Running AI analysis…')

    await supabase.from('site_analyses').update({ status: 'analyzing' }).eq('id', analysisId)

    const runtime = await getCRMRuntimeSettings()
    const companyCtx = buildCompanyContext(runtime)

    const analysisPrompt = buildAnalysisPrompt(url, domain, html, companyCtx)

    const result = await callAIJSON<AnalysisResult>(analysisPrompt, {
      maxTokens: 4000,
      feature: 'site_analyze' as AIFeature,
      lead_id: options?.leadId,
    })

    if (!result) {
      throw new Error('AI analysis returned empty result')
    }

    // 4. Calculate scores
    const scores = calculateScores(result)

    // 5. Store results
    options?.onStatusChange?.('complete', 'Saving results…')

    const { data: updated, error: updateErr } = await supabase
      .from('site_analyses')
      .update({
        status: 'complete',
        tech_stack: result.tech_stack || {},
        seo_audit: result.seo_audit || {},
        performance: result.performance || {},
        content_audit: result.content_audit || {},
        visual_audit: result.visual_audit || {},
        score_overall: scores.overall,
        score_seo: scores.seo,
        score_performance: scores.performance,
        score_content: scores.content,
        score_visual: scores.visual,
        ai_summary: result.ai_summary || null,
        ai_opportunities: result.ai_opportunities || null,
        ai_talking_points: result.ai_talking_points || null,
        ai_competitor_notes: result.ai_competitor_notes || null,
        crawled_at: new Date().toISOString(),
        analyzed_at: new Date().toISOString(),
      })
      .eq('id', analysisId)
      .select('*, lead:crm_leads(id, name, company, website)')
      .single()

    if (updateErr) throw new Error(updateErr.message)

    // 6. Log generation
    void logGeneration({
      feature: 'site_analyze' as AIFeature,
      taskType: 'research',
      leadId: options?.leadId ?? null,
      input: analysisPrompt,
      output: JSON.stringify(result),
      inputMeta: { url, domain },
      provider: runtime.active_ai_provider,
      model: runtime.active_ai_model,
    })

    return updated as SiteAnalysis

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)

    await supabase.from('site_analyses').update({
      status: 'failed',
      error: errMsg,
    }).eq('id', analysisId)

    void logGeneration({
      feature: 'site_analyze' as AIFeature,
      taskType: 'research',
      leadId: options?.leadId ?? null,
      input: `Analyze ${url}`,
      error: errMsg,
      inputMeta: { url, domain },
    })

    options?.onStatusChange?.('failed', errMsg)
    return null
  }
}

// ─────────────────────────────────────────────────────────
// Prompt construction
// ─────────────────────────────────────────────────────────

interface AnalysisResult {
  tech_stack: TechStack
  seo_audit: SEOAudit
  performance: PerformanceAudit
  content_audit: ContentAudit
  visual_audit: VisualAudit
  ai_summary: string
  ai_opportunities: string
  ai_talking_points: string
  ai_competitor_notes: string
}

function getAnalysisSchema() {
  return {
    tech_stack: {
      cms: 'string or null',
      framework: 'string or null',
      analytics: ['list of analytics tools'],
      ads: ['list of ad pixels'],
      email_marketing: ['list of email tools'],
      cdn: 'string or null',
      hosting: 'string or null',
      ecommerce: 'string or null',
      other: ['other notable technologies'],
    },
    seo_audit: {
      has_meta_title: true,
      title_length: 55,
      title_text: 'string',
      has_meta_description: true,
      description_length: 150,
      description_text: 'string',
      has_og_image: false,
      has_og_title: false,
      has_og_description: false,
      has_canonical: true,
      has_robots_meta: false,
      has_structured_data: false,
      structured_data_types: [],
      h1_count: 1,
      h1_texts: ['string'],
      has_sitemap: true,
      has_robots_txt: true,
      issues: ['list of SEO issues found'],
    },
    performance: {
      speed_score: 65,
      mobile_score: 50,
      lcp_ms: 2400,
      cls: 0.1,
      fid_ms: 100,
      total_size_kb: 2500,
      request_count: 45,
      issues: ['list of performance issues'],
    },
    content_audit: {
      page_count: 12,
      avg_word_count: 350,
      has_blog: true,
      blog_post_count: 8,
      blog_frequency: 'monthly',
      video_count: 0,
      video_sources: [],
      image_count: 30,
      has_testimonials: false,
      has_case_studies: false,
      has_pricing: true,
      has_contact_form: true,
      social_links: ['instagram', 'linkedin'],
      cta_count: 5,
    },
    visual_audit: {
      colors: ['#hex1', '#hex2', '#hex3'],
      typography: 'modern/classic/minimal',
      design_era: '2020+/2015-2019/pre-2015',
      responsive: true,
      dark_mode: false,
      animations: false,
      overall_impression: '1-2 sentence visual assessment',
    },
    ai_summary: '2-3 sentence executive summary of the website quality and business.',
    ai_opportunities: 'Detailed paragraph about what video/creative services to pitch to this company and why, based on gaps found in their current website. Be specific.',
    ai_talking_points: 'Bullet-point style talking points for a sales call or outreach email. Include specific references to their website. Format as a numbered list.',
    ai_competitor_notes: 'Brief notes about competitors in their space and how they compare visually and content-wise.',
  }
}

function buildAnalysisPrompt(url: string, domain: string, html: string, companyContext: string): string {
  const htmlSnippet = html
    ? `\n\nHere is the HTML content of their homepage (truncated):\n\`\`\`html\n${html.slice(0, 8000)}\n\`\`\``
    : ''

  return `You are a senior web analyst and B2B sales strategist. Analyze the website at ${url} (domain: ${domain}).

Our company context (we are looking for ways to pitch our services):
${companyContext}

${htmlSnippet}

Based on publicly available information about this domain and ${html ? 'the HTML provided' : 'what you know about this type of business'}, provide a comprehensive analysis.

IMPORTANT RULES:
- Be realistic and honest in your assessment. Don't inflate scores.
- If you're uncertain about something, make your best informed guess and note uncertainty.
- Video presence is a KEY signal — if they have no video content, this is a major opportunity for our video production services.
- Focus opportunities and talking points on video production, content creation, and digital marketing services.
- For tech_stack: infer from common patterns (e.g. WordPress sites often use specific plugins, Shopify sites have specific features).
- For performance: estimate realistic scores based on the type of site and technology used.
- For scores: use the full range 0-100. A typical small business site scores 40-60.

Return ONLY valid JSON matching this exact structure:
${JSON.stringify(getAnalysisSchema(), null, 2)}`
}

// ─────────────────────────────────────────────────────────
// Score calculation
// ─────────────────────────────────────────────────────────

function calculateScores(result: AnalysisResult): {
  overall: number
  seo: number
  performance: number
  content: number
  visual: number
} {
  const seo = calculateSEOScore(result.seo_audit)
  const performance = calculatePerformanceScore(result.performance)
  const content = calculateContentScore(result.content_audit)
  const visual = calculateVisualScore(result.visual_audit)

  // Weighted average: SEO 30%, Performance 20%, Content 30%, Visual 20%
  const overall = Math.round(seo * 0.3 + performance * 0.2 + content * 0.3 + visual * 0.2)

  return { overall, seo, performance, content, visual }
}

function calculateSEOScore(audit: SEOAudit): number {
  let score = 0
  let total = 0

  const checks: [boolean | undefined, number][] = [
    [audit.has_meta_title, 15],
    [audit.has_meta_description, 15],
    [audit.has_og_image, 10],
    [audit.has_og_title, 5],
    [audit.has_og_description, 5],
    [audit.has_canonical, 10],
    [audit.has_structured_data, 10],
    [audit.has_sitemap, 10],
    [audit.has_robots_txt, 5],
    [audit.h1_count === 1, 10],
  ]

  for (const [pass, weight] of checks) {
    total += weight
    if (pass) score += weight
  }

  // Title length bonus
  if (audit.title_length && audit.title_length > 0 && audit.title_length <= 60) {
    score += 5
  }
  total += 5

  return Math.round((score / total) * 100)
}

function calculatePerformanceScore(perf: PerformanceAudit): number {
  // If the AI provided a speed_score, use that as base
  if (perf.speed_score && perf.speed_score > 0) {
    const mobile = perf.mobile_score || perf.speed_score * 0.8
    return Math.round((perf.speed_score + mobile) / 2)
  }

  // Fallback: estimate from CWV
  let score = 50
  if (perf.lcp_ms) {
    if (perf.lcp_ms <= 2500) score += 15
    else if (perf.lcp_ms <= 4000) score += 5
    else score -= 10
  }
  if (perf.cls !== undefined) {
    if (perf.cls <= 0.1) score += 15
    else if (perf.cls <= 0.25) score += 5
    else score -= 10
  }
  if (perf.fid_ms) {
    if (perf.fid_ms <= 100) score += 10
    else if (perf.fid_ms <= 300) score += 3
    else score -= 10
  }

  return Math.max(0, Math.min(100, score))
}

function calculateContentScore(content: ContentAudit): number {
  let score = 0

  // Page count
  if (content.page_count) {
    if (content.page_count >= 10) score += 15
    else if (content.page_count >= 5) score += 10
    else score += 5
  }

  // Word count
  if (content.avg_word_count) {
    if (content.avg_word_count >= 500) score += 15
    else if (content.avg_word_count >= 300) score += 10
    else score += 5
  }

  // Blog
  if (content.has_blog) score += 10
  if (content.blog_post_count && content.blog_post_count >= 10) score += 5

  // Video presence (key signal!)
  if (content.video_count && content.video_count > 0) score += 15
  else score += 0 // Big gap = opportunity

  // Social proof
  if (content.has_testimonials) score += 10
  if (content.has_case_studies) score += 5

  // Essentials
  if (content.has_contact_form) score += 5
  if (content.has_pricing) score += 5
  if (content.social_links && content.social_links.length >= 2) score += 5

  // CTA density
  if (content.cta_count && content.cta_count >= 3) score += 5
  else if (content.cta_count && content.cta_count >= 1) score += 2

  return Math.min(100, score)
}

function calculateVisualScore(visual: VisualAudit): number {
  let score = 40 // Base

  if (visual.responsive) score += 20
  if (visual.design_era === '2020+' || visual.design_era === '2023+') score += 15
  else if (visual.design_era === '2015-2019') score += 5

  if (visual.typography === 'modern' || visual.typography === 'minimal') score += 10
  if (visual.animations) score += 5
  if (visual.dark_mode) score += 5
  if (visual.colors && visual.colors.length >= 2) score += 5

  return Math.min(100, score)
}

// ─────────────────────────────────────────────────────────
// Outreach integration
// ─────────────────────────────────────────────────────────

export async function generateOutreachFromAnalysis(
  analysis: SiteAnalysis,
  leadName?: string,
  leadCompany?: string,
): Promise<{ subject: string; body: string } | null> {
  const runtime = await getCRMRuntimeSettings()
  const companyCtx = buildCompanyContext(runtime)

  const prompt = `You are a B2B sales copywriter for a video production company.

Our company:
${companyCtx}

We analyzed a prospect's website and found:
- Domain: ${analysis.domain}
- Overall Score: ${analysis.score_overall}/100
- SEO Score: ${analysis.score_seo}/100
- Content Score: ${analysis.score_content}/100
- Video count: ${analysis.content_audit?.video_count ?? 0}
- Tech stack: ${JSON.stringify(analysis.tech_stack)}
- AI Summary: ${analysis.ai_summary}
- Opportunities: ${analysis.ai_opportunities}
- Talking Points: ${analysis.ai_talking_points}

Contact: ${leadName || 'the team'} at ${leadCompany || analysis.domain}

Write a personalized cold outreach email that:
1. References something specific about their website (NOT generic)
2. Identifies a gap (especially missing video content if applicable)
3. Proposes a specific service that would help
4. Keeps it under 150 words
5. Ends with a soft CTA (calendar link or reply)

Return ONLY valid JSON:
{"subject": "Email subject line", "body": "Email body text"}`

  try {
    return await callAIJSON<{ subject: string; body: string }>(prompt, {
      maxTokens: 800,
      feature: 'outreach_email' as AIFeature,
    })
  } catch {
    return null
  }
}
