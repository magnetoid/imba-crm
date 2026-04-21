import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus, Pencil, Trash2, Loader2, ExternalLink, Eye, AlertCircle, CheckCircle,
  Globe, FileText, Sparkles, Search, Brain, Wand2, LayoutList, HelpCircle, Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface SeoPage {
  id: string
  path: string
  title?: string
  description?: string
  og_title?: string
  og_description?: string
  og_image?: string
  canonical?: string
  noindex: boolean
  structured_data?: object
  created_at: string
}

const SITE_URL = 'https://imbaproduction.com'
const SITE_NAME = 'Imba Production'
const COMPANY_CONTEXT = `Imba Production is a cinematic video production company specializing in brand videos, AI video, product videos, social media content, drone footage, fashion video, testimonials, e-learning, and cooking videos. Based in Serbia, serving global clients. Known for dark cinematic aesthetic, AI-powered strategy, and premium quality.`

const ALL_PAGES = [
  { path: '/',                           label: 'Homepage',          desc: 'main landing page for cinematic video production' },
  { path: '/work',                       label: 'Portfolio / Work',  desc: 'portfolio showcase of video production projects' },
  { path: '/services',                   label: 'Services',          desc: 'video production services overview' },
  { path: '/about',                      label: 'About',             desc: 'company story and team' },
  { path: '/blog',                       label: 'Blog',              desc: 'video marketing and production blog' },
  { path: '/contact',                    label: 'Contact',           desc: 'contact form and company info' },
  { path: '/reviews',                    label: 'Reviews',           desc: 'client testimonials and reviews' },
  { path: '/services/brand-video',       label: 'Brand Video',       desc: 'brand video production service' },
  { path: '/services/ai-video',          label: 'AI Video',          desc: 'AI-powered video production service' },
  { path: '/services/product-video',     label: 'Product Video',     desc: 'product video production service' },
  { path: '/services/social-video',      label: 'Social Video',      desc: 'social media video content service' },
  { path: '/services/cooking-video',     label: 'Cooking Video',     desc: 'food and cooking video production' },
  { path: '/services/post-production',   label: 'Post Production',   desc: 'post production and editing service' },
  { path: '/services/elearning-video',   label: 'eLearning Video',   desc: 'e-learning and educational video production' },
  { path: '/services/fashion-video',     label: 'Fashion Video',     desc: 'fashion and beauty video production' },
  { path: '/services/testimonial-video', label: 'Testimonial Video', desc: 'client testimonial video production' },
  { path: '/services/drone-video',       label: 'Drone & Aerial',    desc: 'drone and aerial video production' },
]

const EMPTY: Omit<SeoPage, 'id' | 'created_at'> = {
  path: '', title: '', description: '', og_title: '', og_description: '',
  og_image: '', canonical: '', noindex: false, structured_data: undefined,
}

function titleScore(title?: string) {
  if (!title) return { score: 0, label: 'Missing', color: 'text-red-400' }
  const l = title.length
  if (l <= 60) return { score: 100, label: `${l}/60 ✓`, color: 'text-green-400' }
  if (l <= 70) return { score: 60, label: `${l}/60 — too long`, color: 'text-yellow-400' }
  return { score: 20, label: `${l}/60 — way too long`, color: 'text-red-400' }
}

function descScore(desc?: string) {
  if (!desc) return { score: 0, label: 'Missing', color: 'text-red-400' }
  const l = desc.length
  if (l >= 120 && l <= 160) return { score: 100, label: `${l} chars ✓`, color: 'text-green-400' }
  if (l >= 80 && l < 120) return { score: 60, label: `${l} chars — short`, color: 'text-yellow-400' }
  if (l > 160) return { score: 60, label: `${l} chars — truncated`, color: 'text-yellow-400' }
  return { score: 20, label: `${l} chars — too short`, color: 'text-red-400' }
}

function pageHealth(row: SeoPage): number {
  let score = 0
  if (row.title) score += 25
  if (row.description) score += 25
  if (row.og_image) score += 20
  if (row.og_title || row.og_description) score += 15
  if (row.structured_data) score += 15
  return row.noindex ? 0 : score
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-7 flex-shrink-0">{score}</span>
    </div>
  )
}

function SerpPreview({ title, description, path }: { title?: string; description?: string; path: string }) {
  const displayTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Cinematic Video Production`
  const displayDesc = description || 'Next-gen video production powered by cinematic craft and AI strategy.'
  const displayUrl = `${SITE_URL}${path}`
  return (
    <div className="bg-white rounded-lg p-4 text-left max-w-xl">
      <div className="flex items-center gap-1 mb-1">
        <div className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0" />
        <span className="text-xs text-gray-600 truncate">{SITE_NAME} › {path === '/' ? 'Home' : path.replace(/^\//, '').replace(/\//g, ' › ')}</span>
      </div>
      <p className="text-blue-700 text-lg font-normal leading-tight mb-1 line-clamp-2" style={{ fontFamily: 'Arial, sans-serif' }}>
        {displayTitle.length > 60 ? displayTitle.slice(0, 57) + '…' : displayTitle}
      </p>
      <p className="text-green-700 text-xs mb-1 truncate" style={{ fontFamily: 'Arial, sans-serif' }}>{displayUrl}</p>
      <p className="text-gray-600 text-sm leading-snug" style={{ fontFamily: 'Arial, sans-serif', lineHeight: '1.4' }}>
        {displayDesc.length > 160 ? displayDesc.slice(0, 157) + '…' : displayDesc}
      </p>
    </div>
  )
}

async function callClaude(apiKey: string, prompt: string, maxTokens = 1000): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

async function claudeJSON<T>(apiKey: string, prompt: string, maxTokens = 1500): Promise<T | null> {
  const text = await callClaude(apiKey, prompt, maxTokens)
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/m)
  if (!match) return null
  try { return JSON.parse(match[0]) as T } catch { return null }
}

// ─── AI Studio tab components ────────────────────────────────────────────────

interface KeywordCluster {
  keyword: string
  intent: 'informational' | 'commercial' | 'transactional' | 'navigational'
  monthly_volume: string
  difficulty: 'low' | 'medium' | 'high'
  relevance: number
}

interface ContentBrief {
  h1: string
  meta_title: string
  meta_description: string
  target_keywords: string[]
  outline: { level: 'h2' | 'h3'; text: string }[]
  word_count: number
  cta: string
  internal_links: string[]
}

interface FAQItem {
  question: string
  answer: string
}

function AIKeywordResearch({ apiKey }: { apiKey: string }) {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [clusters, setClusters] = useState<KeywordCluster[]>([])

  async function generate() {
    if (!apiKey) { toast.error('Add Anthropic API key in Settings first'); return }
    if (!topic.trim()) return
    setLoading(true)
    const prompt = `You are an SEO expert. Generate keyword research for: "${topic}"
Context: ${COMPANY_CONTEXT}

Return a JSON array of 15 keywords with this exact structure:
[{"keyword":"...","intent":"informational","monthly_volume":"1k-10k","difficulty":"medium","relevance":85}]

Intent options: informational, commercial, transactional, navigational
Difficulty: low, medium, high
Relevance: 0-100 (how relevant to Imba Production)
Volume: rough estimate like "100-1k", "1k-10k", "10k-100k"

Return ONLY the JSON array, no other text.`
    const result = await claudeJSON<KeywordCluster[]>(apiKey, prompt)
    if (result) { setClusters(result); toast.success(`${result.length} keywords generated`) }
    else toast.error('Failed to parse keywords')
    setLoading(false)
  }

  const intentColor = (intent: string) => ({
    informational: 'bg-blue-500/10 text-blue-400',
    commercial: 'bg-amber-500/10 text-amber-400',
    transactional: 'bg-green-500/10 text-green-400',
    navigational: 'bg-purple-500/10 text-purple-400',
  }[intent] || 'bg-muted text-muted-foreground')

  const diffColor = (d: string) => ({ low: 'text-green-400', medium: 'text-yellow-400', high: 'text-red-400' }[d] || '')

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Search className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">Keyword Research</h3>
      </div>
      <div className="flex gap-2 mb-5">
        <Input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && generate()}
          placeholder="e.g. brand video production, corporate video services..."
          className="flex-1"
        />
        <Button onClick={generate} disabled={loading || !topic.trim()} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Research
        </Button>
      </div>

      {clusters.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground">Keyword</th>
                <th className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground">Intent</th>
                <th className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground">Volume</th>
                <th className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground">Difficulty</th>
                <th className="px-4 py-2.5 text-left text-xs font-mono text-muted-foreground">Relevance</th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((kw, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-xs">{kw.keyword}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[0.65rem] px-1.5 py-0.5 rounded font-medium capitalize ${intentColor(kw.intent)}`}>
                      {kw.intent}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{kw.monthly_volume}</td>
                  <td className={`px-4 py-2.5 text-xs font-mono capitalize ${diffColor(kw.difficulty)}`}>{kw.difficulty}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${kw.relevance}%` }} />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{kw.relevance}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AIContentBrief({ apiKey }: { apiKey: string }) {
  const [topic, setTopic] = useState('')
  const [pagePath, setPagePath] = useState('')
  const [loading, setLoading] = useState(false)
  const [brief, setBrief] = useState<ContentBrief | null>(null)

  async function generate() {
    if (!apiKey) { toast.error('Add Anthropic API key in Settings first'); return }
    if (!topic.trim()) return
    setLoading(true)
    const pageCtx = pagePath ? ` for the page at ${pagePath}` : ''
    const prompt = `You are a senior SEO content strategist. Create a detailed content brief${pageCtx} about: "${topic}"
Company context: ${COMPANY_CONTEXT}

Return ONLY a valid JSON object with this structure:
{
  "h1": "Main headline",
  "meta_title": "SEO title under 60 chars",
  "meta_description": "Meta description 120-160 chars with CTA",
  "target_keywords": ["primary keyword", "secondary keyword", ...5 keywords],
  "outline": [
    {"level":"h2","text":"Section heading"},
    {"level":"h3","text":"Subsection"},
    ...8-12 total headings
  ],
  "word_count": 1200,
  "cta": "Call to action text",
  "internal_links": ["/work", "/contact", ...]
}`
    const result = await claudeJSON<ContentBrief>(apiKey, prompt, 2000)
    if (result) { setBrief(result); toast.success('Content brief generated') }
    else toast.error('Failed to generate brief')
    setLoading(false)
  }

  async function applyToPage() {
    if (!brief || !pagePath) { toast.error('Select a page first'); return }
    const { error } = await supabase.from('seo_pages').upsert([{
      path: pagePath,
      title: brief.meta_title,
      description: brief.meta_description,
      og_title: brief.meta_title,
      og_description: brief.meta_description,
      noindex: false,
    }], { onConflict: 'path' })
    if (error) toast.error(error.message)
    else toast.success('Meta tags saved to page override')
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <LayoutList className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">Content Brief Generator</h3>
      </div>
      <div className="flex gap-2 mb-3">
        <Input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g. Why brand video is essential for B2B marketing in 2025"
          className="flex-1"
        />
        <Select value={pagePath} onValueChange={setPagePath}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Target page (opt.)" /></SelectTrigger>
          <SelectContent>
            {ALL_PAGES.map(p => <SelectItem key={p.path} value={p.path}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={generate} disabled={loading || !topic.trim()} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          Generate
        </Button>
      </div>

      {brief && (
        <div className="border border-border rounded-lg p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">H1</p>
              <p className="text-sm font-semibold">{brief.h1}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Meta Title</p>
                <p className={`text-xs ${titleScore(brief.meta_title).color}`}>{brief.meta_title}</p>
                <p className={`text-[0.6rem] ${titleScore(brief.meta_title).color} mt-0.5`}>{titleScore(brief.meta_title).label}</p>
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Target Keywords</p>
                <div className="flex flex-wrap gap-1">
                  {brief.target_keywords.map(kw => (
                    <span key={kw} className="text-[0.6rem] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{kw}</span>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Meta Description</p>
              <p className="text-xs text-muted-foreground">{brief.meta_description}</p>
              <p className={`text-[0.6rem] mt-0.5 ${descScore(brief.meta_description).color}`}>{descScore(brief.meta_description).label}</p>
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Content Outline ({brief.word_count} words)</p>
              <div className="flex flex-col gap-1">
                {brief.outline.map((item, i) => (
                  <div key={i} className={`text-xs ${item.level === 'h2' ? 'font-medium text-foreground' : 'text-muted-foreground pl-4'}`}>
                    <span className="font-mono text-muted-foreground/50 mr-2">{item.level.toUpperCase()}</span>
                    {item.text}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-xs font-mono text-muted-foreground">CTA: <span className="text-primary">{brief.cta}</span></p>
                <p className="text-xs text-muted-foreground mt-1">Internal links: {brief.internal_links.join(', ')}</p>
              </div>
              {pagePath && (
                <Button size="sm" onClick={applyToPage} className="gap-2">
                  <Wand2 className="h-3.5 w-3.5" />Apply to {pagePath}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AIFAQGenerator({ apiKey }: { apiKey: string }) {
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState('8')
  const [loading, setLoading] = useState(false)
  const [faqs, setFaqs] = useState<FAQItem[]>([])
  const [copied, setCopied] = useState(false)

  async function generate() {
    if (!apiKey) { toast.error('Add Anthropic API key in Settings first'); return }
    if (!topic.trim()) return
    setLoading(true)
    const prompt = `You are an SEO expert. Generate ${count} FAQ questions and answers for: "${topic}"
Company context: ${COMPANY_CONTEXT}

Return ONLY a JSON array:
[{"question":"Q?","answer":"A."},...]

Rules:
- Questions should match real user search queries
- Answers should be 2-4 sentences, factual and helpful
- Cover pricing, process, timeline, quality questions where relevant`
    const result = await claudeJSON<FAQItem[]>(apiKey, prompt)
    if (result) { setFaqs(result); toast.success(`${result.length} FAQs generated`) }
    else toast.error('Failed to generate FAQs')
    setLoading(false)
  }

  const jsonLd = faqs.length > 0 ? JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  }, null, 2) : ''

  function copySchema() {
    navigator.clipboard.writeText(jsonLd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <HelpCircle className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">FAQ Schema Generator</h3>
        <span className="text-xs text-muted-foreground">— generates FAQPage JSON-LD for rich results</span>
      </div>
      <div className="flex gap-2 mb-5">
        <Input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g. corporate video production, drone filming service..."
          className="flex-1"
        />
        <Select value={count} onValueChange={setCount}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['5','8','10','12'].map(n => <SelectItem key={n} value={n}>{n} FAQs</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={generate} disabled={loading || !topic.trim()} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <HelpCircle className="h-4 w-4" />}
          Generate
        </Button>
      </div>

      {faqs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-border rounded-lg p-3">
                <p className="text-xs font-semibold text-foreground mb-1">{faq.question}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">JSON-LD Schema</p>
              <Button size="sm" variant="outline" onClick={copySchema} className="gap-1.5 text-xs h-7">
                {copied ? '✓ Copied!' : 'Copy schema'}
              </Button>
            </div>
            <pre className="text-[0.6rem] font-mono text-muted-foreground bg-muted/30 rounded-lg p-3 overflow-auto max-h-80 leading-relaxed">
              {jsonLd}
            </pre>
            <p className="text-xs text-muted-foreground">Paste this into the JSON-LD field of a page override to get FAQ rich results in Google.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function AIBatchOptimizer({ apiKey, existingRows, onRefresh }: { apiKey: string; existingRows: SeoPage[]; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [done, setDone] = useState(false)

  const uncovered = ALL_PAGES.filter(p => !existingRows.find(r => r.path === p.path))

  async function runBatch() {
    if (!apiKey) { toast.error('Add Anthropic API key in Settings first'); return }
    if (uncovered.length === 0) { toast.success('All pages already have meta overrides!'); return }
    setLoading(true)
    setProgress([])
    setDone(false)

    for (const page of uncovered) {
      setProgress(prev => [...prev, `Generating: ${page.label}…`])
      const prompt = `Generate SEO metadata for the "${page.label}" page (${page.path}) of Imba Production.
Page context: ${page.desc}
Company context: ${COMPANY_CONTEXT}

Return ONLY a JSON object:
{
  "title": "SEO title under 60 chars",
  "description": "Meta description 120-160 chars with clear CTA",
  "og_title": "Social share title",
  "og_description": "Social share description 2-3 sentences"
}`
      try {
        const result = await claudeJSON<{ title: string; description: string; og_title: string; og_description: string }>(apiKey, prompt, 500)
        if (result) {
          await supabase.from('seo_pages').upsert([{
            path: page.path,
            title: result.title,
            description: result.description,
            og_title: result.og_title,
            og_description: result.og_description,
            noindex: false,
          }], { onConflict: 'path' })
          setProgress(prev => [...prev.slice(0, -1), `✓ ${page.label}`])
        } else {
          setProgress(prev => [...prev.slice(0, -1), `✗ ${page.label} — parse error`])
        }
      } catch {
        setProgress(prev => [...prev.slice(0, -1), `✗ ${page.label} — API error`])
      }
    }

    setDone(true)
    setLoading(false)
    onRefresh()
    toast.success('Batch optimization complete')
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">Batch Meta Optimizer</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        AI generates and saves meta title + description for all pages that don't have an override yet.
        {uncovered.length > 0
          ? <span className="text-amber-400 ml-1">{uncovered.length} pages need optimization.</span>
          : <span className="text-green-400 ml-1">All {ALL_PAGES.length} pages are covered.</span>}
      </p>

      {uncovered.length > 0 && (
        <div className="border border-border rounded-lg p-4 mb-5">
          <p className="text-xs font-mono text-muted-foreground mb-2">Pages to optimize:</p>
          <div className="flex flex-wrap gap-1.5">
            {uncovered.map(p => (
              <span key={p.path} className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded">{p.label}</span>
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={runBatch}
        disabled={loading || uncovered.length === 0}
        className="gap-2 bg-primary hover:bg-primary/90 mb-4"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        {loading ? 'Optimizing…' : `Optimize ${uncovered.length} pages`}
      </Button>

      {progress.length > 0 && (
        <div className="border border-border rounded-lg p-4">
          <p className="text-xs font-mono text-muted-foreground mb-2">Progress</p>
          <div className="flex flex-col gap-1">
            {progress.map((p, i) => (
              <p key={i} className={`text-xs font-mono ${p.startsWith('✓') ? 'text-green-400' : p.startsWith('✗') ? 'text-red-400' : 'text-muted-foreground'}`}>{p}</p>
            ))}
            {done && <p className="text-xs font-mono text-green-400 mt-1">— Batch complete. Refresh the Pages tab to see results.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SEOManager() {
    const [rows, setRows] = useState<SeoPage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [structuredRaw, setStructuredRaw] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'pages' | 'ai-studio' | 'sitemap' | 'robots'>('pages')
  const [aiStudioTab, setAiStudioTab] = useState<'keywords' | 'brief' | 'faq' | 'batch'>('keywords')
  const [generatingField, setGeneratingField] = useState<string | null>(null)
  const [apiKey] = useState(() => localStorage.getItem('anthropic_api_key') || '')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('seo_pages').select('*').order('path')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd(prefillPath = '') {
    setEditingId(null)
    setForm({ ...EMPTY, path: prefillPath })
    setStructuredRaw('')
    setJsonError('')
    setError('')
    setDialogOpen(true)
  }

  function openEdit(row: SeoPage) {
    setEditingId(row.id)
    setForm({
      path: row.path, title: row.title || '', description: row.description || '',
      og_title: row.og_title || '', og_description: row.og_description || '',
      og_image: row.og_image || '', canonical: row.canonical || '',
      noindex: row.noindex, structured_data: row.structured_data,
    })
    setStructuredRaw(row.structured_data ? JSON.stringify(row.structured_data, null, 2) : '')
    setJsonError('')
    setError('')
    setDialogOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.path.trim()) { setError('Path is required'); return }
    let structured: object | undefined
    if (structuredRaw.trim()) {
      try { structured = JSON.parse(structuredRaw) }
      catch { setJsonError('Invalid JSON — check your schema syntax'); return }
    }
    setSaving(true)
    setError('')
    const payload = { ...form, path: form.path.trim(), structured_data: structured ?? null }
    const { error: err } = editingId
      ? await supabase.from('seo_pages').update(payload).eq('id', editingId)
      : await supabase.from('seo_pages').upsert([payload], { onConflict: 'path' })
    setSaving(false)
    if (err) { setError(err.message); return }
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this SEO override?')) return
    await supabase.from('seo_pages').delete().eq('id', id)
    load()
  }

  // AI fill functions
  async function aiGenerateMeta() {
    if (!apiKey) { toast.error('Add Anthropic API key in Settings first'); return }
    if (!form.path) { toast.error('Select a page first'); return }
    const pageInfo = ALL_PAGES.find(p => p.path === form.path)
    setGeneratingField('meta')
    const prompt = `Generate SEO metadata for the "${pageInfo?.label || form.path}" page (${form.path}) of Imba Production.
Page context: ${pageInfo?.desc || 'a page on the Imba Production website'}
Company context: ${COMPANY_CONTEXT}

Return ONLY a JSON object:
{
  "title": "SEO title under 60 chars",
  "description": "Meta description 120-160 chars with clear CTA",
  "og_title": "Social share title",
  "og_description": "Social share description 2-3 sentences"
}`
    const result = await claudeJSON<{ title: string; description: string; og_title: string; og_description: string }>(apiKey, prompt, 600)
    if (result) {
      setForm(f => ({
        ...f,
        title: result.title || f.title,
        description: result.description || f.description,
        og_title: result.og_title || f.og_title,
        og_description: result.og_description || f.og_description,
      }))
      toast.success('Meta tags generated')
    } else {
      toast.error('Failed to generate meta tags')
    }
    setGeneratingField(null)
  }

  async function aiGenerateSchema() {
    if (!apiKey) { toast.error('Add Anthropic API key in Settings first'); return }
    if (!form.path) { toast.error('Select a page first'); return }
    const pageInfo = ALL_PAGES.find(p => p.path === form.path)
    setGeneratingField('schema')
    const prompt = `Generate a Schema.org JSON-LD structured data object for the "${pageInfo?.label || form.path}" page (${form.path}) of Imba Production.
${COMPANY_CONTEXT}
Title: ${form.title || pageInfo?.label}
Description: ${form.description}

Choose the most appropriate schema type (WebPage, Service, VideoObject, FAQPage, Organization, etc.)
Return ONLY valid JSON-LD. No markdown, no explanation.`
    const text = await callClaude(apiKey, prompt, 1000)
    const match = text.match(/\{[\s\S]*\}/m)
    if (match) {
      try {
        JSON.parse(match[0]) // validate
        setStructuredRaw(JSON.stringify(JSON.parse(match[0]), null, 2))
        toast.success('JSON-LD schema generated')
      } catch {
        toast.error('Generated schema has invalid JSON')
      }
    } else {
      toast.error('Failed to generate schema')
    }
    setGeneratingField(null)
  }

  const rowByPath = Object.fromEntries(rows.map(r => [r.path, r]))
  const previewRow = previewPath ? rowByPath[previewPath] : null

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">SEO & AI Studio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage meta tags, generate content, and optimize pages with AI</p>
        </div>
        <Button onClick={() => openAdd()}>
          <Plus className="h-4 w-4 mr-2" />Add page override
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          { key: 'pages',      label: 'Pages',       icon: Globe },
          { key: 'ai-studio',  label: 'AI Studio',   icon: Sparkles },
          { key: 'sitemap',    label: 'Sitemap',      icon: FileText },
          { key: 'robots',     label: 'Robots & LLMs', icon: ExternalLink },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors -mb-px ${
              activeTab === key
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── PAGES TAB ── */}
      {activeTab === 'pages' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex gap-6">
              <div className="flex-1 min-w-0">
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Page</th>
                        <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Title</th>
                        <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Title len</th>
                        <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Desc len</th>
                        <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Health</th>
                        <th className="px-4 py-3 text-left text-xs font-mono text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-mono text-muted-foreground"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_PAGES.map(({ path, label }) => {
                        const row = rowByPath[path]
                        const ts = titleScore(row?.title)
                        const ds = descScore(row?.description)
                        const health = row ? pageHealth(row) : 0
                        return (
                          <tr
                            key={path}
                            className={`border-b border-border last:border-0 transition-colors hover:bg-muted/10 cursor-pointer ${previewPath === path ? 'bg-muted/20' : ''}`}
                            onClick={() => setPreviewPath(previewPath === path ? null : path)}
                          >
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-foreground text-xs">{label}</p>
                                <p className="text-xs text-muted-foreground font-mono">{path}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 max-w-[160px]">
                              <p className="text-xs text-muted-foreground truncate">{row?.title || <span className="text-muted-foreground/40 italic">default</span>}</p>
                            </td>
                            <td className="px-4 py-3"><span className={`text-xs font-mono ${ts.color}`}>{ts.label}</span></td>
                            <td className="px-4 py-3"><span className={`text-xs font-mono ${ds.color}`}>{ds.label}</span></td>
                            <td className="px-4 py-3">
                              {row ? <HealthBar score={health} /> : <span className="text-xs text-muted-foreground/40 italic">no override</span>}
                            </td>
                            <td className="px-4 py-3">
                              {row?.noindex
                                ? <Badge variant="destructive" className="text-[0.6rem]">noindex</Badge>
                                : row
                                  ? <Badge variant="secondary" className="text-[0.6rem]">✓ override</Badge>
                                  : <Badge variant="outline" className="text-[0.6rem] text-muted-foreground">default</Badge>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                                <Button variant="ghost" size="sm" onClick={() => setPreviewPath(previewPath === path ? null : path)}><Eye className="h-3.5 w-3.5" /></Button>
                                {row ? (
                                  <>
                                    <Button variant="ghost" size="sm" onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </>
                                ) : (
                                  <Button variant="ghost" size="sm" onClick={() => openAdd(path)}><Plus className="h-3.5 w-3.5" /></Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {rows.filter(r => !ALL_PAGES.find(p => p.path === r.path)).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-2 font-mono">Other overrides</p>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody>
                          {rows.filter(r => !ALL_PAGES.find(p => p.path === r.path)).map(row => (
                            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs">{row.path}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]">{row.title || '—'}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* SERP Preview panel */}
              {previewPath !== null && (
                <div className="w-[340px] flex-shrink-0">
                  <div className="border border-border rounded-lg p-4 sticky top-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">SERP Preview</p>
                      <a href={`${SITE_URL}${previewPath}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />Live
                      </a>
                    </div>
                    <SerpPreview title={previewRow?.title} description={previewRow?.description} path={previewPath} />
                    <div className="mt-4 flex flex-col gap-1.5">
                      {[
                        { label: 'Title tag',        ok: !!previewRow?.title },
                        { label: 'Meta description', ok: !!previewRow?.description },
                        { label: 'OG image',         ok: !!previewRow?.og_image },
                        { label: 'OG title/desc',    ok: !!(previewRow?.og_title || previewRow?.og_description) },
                        { label: 'Schema markup',    ok: !!previewRow?.structured_data },
                        { label: 'Canonical',        ok: !!previewRow?.canonical },
                      ].map(({ label, ok }) => (
                        <div key={label} className="flex items-center gap-2">
                          {ok ? <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />}
                          <span className={`text-xs ${ok ? 'text-foreground' : 'text-muted-foreground/50'}`}>{label}</span>
                        </div>
                      ))}
                    </div>
                    {previewRow?.structured_data && (
                      <div className="mt-4">
                        <p className="text-xs font-mono text-muted-foreground mb-1">JSON-LD</p>
                        <pre className="text-[0.6rem] text-muted-foreground bg-muted/30 rounded p-2 overflow-x-auto max-h-32">
                          {JSON.stringify(previewRow.structured_data, null, 2)}
                        </pre>
                      </div>
                    )}
                    <Button size="sm" className="w-full mt-3" variant="outline"
                      onClick={() => previewRow ? openEdit(previewRow) : openAdd(previewPath)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      {previewRow ? 'Edit override' : 'Add override'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── AI STUDIO TAB ── */}
      {activeTab === 'ai-studio' && (
        <div>
          {!apiKey && (
            <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4 mb-6 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-400">
                AI Studio requires an Anthropic API key. Add it in <strong>CRM → Settings</strong>.
              </p>
            </div>
          )}

          {/* AI Studio sub-tabs */}
          <div className="flex gap-1 mb-6 border-b border-border/50">
            {([
              { key: 'keywords', label: 'Keyword Research', icon: Search },
              { key: 'brief',    label: 'Content Brief',    icon: LayoutList },
              { key: 'faq',      label: 'FAQ Schema',        icon: HelpCircle },
              { key: 'batch',    label: 'Batch Optimizer',  icon: Zap },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setAiStudioTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors -mb-px ${
                  aiStudioTab === key
                    ? 'border-primary text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>

          {aiStudioTab === 'keywords' && <AIKeywordResearch apiKey={apiKey} />}
          {aiStudioTab === 'brief'    && <AIContentBrief apiKey={apiKey} />}
          {aiStudioTab === 'faq'      && <AIFAQGenerator apiKey={apiKey} />}
          {aiStudioTab === 'batch'    && <AIBatchOptimizer apiKey={apiKey} existingRows={rows} onRefresh={load} />}
        </div>
      )}

      {/* ── SITEMAP TAB ── */}
      {activeTab === 'sitemap' && (
        <div className="max-w-2xl">
          <div className="border border-border rounded-lg p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">sitemap.xml</h3>
              <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />View
              </a>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Static sitemap at <code className="bg-muted px-1 rounded font-mono">/public/sitemap.xml</code>. Contains {ALL_PAGES.length} URLs.</p>
            <div className="flex flex-col gap-1">
              {ALL_PAGES.map(({ path, label }) => (
                <div key={path} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground font-mono">{path}</span>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium mb-3">Submission checklist</h3>
            {[
              { label: 'Submit to Google Search Console', href: 'https://search.google.com/search-console', done: false },
              { label: 'Submit to Bing Webmaster Tools',  href: 'https://www.bing.com/webmasters',          done: false },
              { label: 'Verify robots.txt allows sitemap', done: true },
              { label: 'All URLs return 200 status',       done: true },
              { label: 'lastmod dates are current',        done: true },
            ].map(({ label, href, done }) => (
              <div key={label} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                {done ? <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />}
                <span className="text-xs text-foreground flex-1">{label}</span>
                {href && (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ROBOTS & LLMS TAB ── */}
      {activeTab === 'robots' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl">
          <div className="border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">robots.txt</h3>
              <a href="/robots.txt" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />View
              </a>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Located at <code className="bg-muted px-1 rounded font-mono">/public/robots.txt</code></p>
            <div className="flex flex-col gap-1.5">
              {[
                { label: 'All bots: allow /',      ok: true },
                { label: 'Admin: disallowed',      ok: true },
                { label: 'GPTBot: allowed',        ok: true },
                { label: 'anthropic-ai: allowed',  ok: true },
                { label: 'Claude-Web: allowed',    ok: true },
                { label: 'PerplexityBot: allowed', ok: true },
                { label: 'Sitemap URL declared',   ok: true },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  {ok ? <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />}
                  <span className="text-xs text-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">llms.txt</h3>
              <a href="/llms.txt" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />View
              </a>
            </div>
            <p className="text-xs text-muted-foreground mb-3">AI crawler context file for ChatGPT, Claude, Perplexity.</p>
            <div className="flex flex-col gap-1.5">
              {[
                { label: 'Business description', ok: true },
                { label: 'All services listed',  ok: true },
                { label: 'Pricing overview',      ok: true },
                { label: 'Social media links',    ok: true },
                { label: 'Contact information',   ok: true },
                { label: 'Content policy',        ok: true },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  {ok ? <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />}
                  <span className="text-xs text-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border border-border rounded-lg p-5 lg:col-span-2">
            <h3 className="text-sm font-medium mb-3">SEO health summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Pages with override', value: rows.filter(r => !r.noindex).length, total: ALL_PAGES.length },
                { label: 'noindex pages',        value: rows.filter(r => r.noindex).length,         total: null },
                { label: 'With schema markup',   value: rows.filter(r => r.structured_data).length, total: null },
                { label: 'With OG image',        value: rows.filter(r => r.og_image).length,        total: null },
              ].map(({ label, value, total }) => (
                <div key={label} className="border border-border rounded-lg p-3">
                  <p className="text-2xl font-bold font-mono">{value}{total ? `/${total}` : ''}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT DIALOG ── */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) setEditingId(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit SEO override' : 'Add SEO override'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {/* Path */}
            <div className="flex flex-col gap-1.5">
              <Label>Page path *</Label>
              <Select value={form.path} onValueChange={v => setForm(f => ({ ...f, path: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a page" /></SelectTrigger>
                <SelectContent>
                  {ALL_PAGES.map(p => <SelectItem key={p.path} value={p.path}>{p.label} — {p.path}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                value={form.path}
                onChange={e => setForm(f => ({ ...f, path: e.target.value }))}
                placeholder="Or type a custom path, e.g. /blog/my-post"
                className="mt-1"
              />
            </div>

            {/* AI Generate button */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={aiGenerateMeta}
                disabled={!!generatingField || !form.path}
                className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
              >
                {generatingField === 'meta' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI Generate Meta Tags
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={aiGenerateSchema}
                disabled={!!generatingField || !form.path}
                className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
              >
                {generatingField === 'schema' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                AI Generate Schema
              </Button>
            </div>

            <Separator />

            {/* Live SERP preview */}
            {(form.title || form.description) && (
              <div>
                <Label className="text-xs mb-2 block">SERP preview</Label>
                <SerpPreview title={form.title} description={form.description} path={form.path || '/'} />
              </div>
            )}

            <Separator />
            <p className="text-sm font-medium">Meta tags</p>

            <div className="flex flex-col gap-1.5">
              <Label className="flex items-center justify-between">
                Title
                <span className={`text-xs ${titleScore(form.title).color}`}>{titleScore(form.title).label}</span>
              </Label>
              <Input value={form.title ?? ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Page title — keep under 60 characters" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="flex items-center justify-between">
                Description
                <span className={`text-xs ${descScore(form.description).color}`}>{descScore(form.description).label}</span>
              </Label>
              <Textarea rows={2} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Meta description — 120–160 characters, include a CTA" />
            </div>

            <Separator />
            <p className="text-sm font-medium">Open Graph (social sharing)</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>OG Title</Label>
                <Input value={form.og_title ?? ''} onChange={e => setForm(f => ({ ...f, og_title: e.target.value }))} placeholder="Social share title" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>OG Image URL</Label>
                <Input value={form.og_image ?? ''} onChange={e => setForm(f => ({ ...f, og_image: e.target.value }))} placeholder="https://… (1200×630px)" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>OG Description</Label>
              <Textarea rows={2} value={form.og_description ?? ''} onChange={e => setForm(f => ({ ...f, og_description: e.target.value }))} placeholder="Social share description" />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Canonical URL</Label>
                <Input value={form.canonical ?? ''} onChange={e => setForm(f => ({ ...f, canonical: e.target.value }))} placeholder="https://imbaproduction.com/…" />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch id="noindex" checked={form.noindex} onCheckedChange={c => setForm(f => ({ ...f, noindex: c }))} />
                <Label htmlFor="noindex">noindex — hide from search</Label>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>JSON-LD Structured data</Label>
              </div>
              <Textarea
                rows={8}
                value={structuredRaw}
                onChange={e => { setStructuredRaw(e.target.value); setJsonError('') }}
                placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "WebPage",\n  "name": "Page name"\n}'}
                className="font-mono text-xs"
              />
              {jsonError && <p className="text-destructive text-xs">{jsonError}</p>}
              <p className="text-xs text-muted-foreground">Supports all schema.org types: WebPage, Article, FAQPage, Service, VideoObject, etc.</p>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save override'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
