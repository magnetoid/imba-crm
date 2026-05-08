import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@imba/shared/ui/button'
import { Badge } from '@imba/shared/ui/badge'
import { Separator } from '@imba/shared/ui/separator'
import toast from 'react-hot-toast'
import {
  ArrowLeft, ExternalLink, Loader2, Sparkles, Copy, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, Search, Layout, Zap,
  Palette, Server, Mail, Radar, MessageSquare,
} from 'lucide-react'
import {
  type SiteAnalysis,
  getAnalysis,
  analyzeSite,
  generateOutreachFromAnalysis,
  scoreColor,
  scoreLabel,
} from './lib/analyzer'

// ─── Score gauge ─────────────────────────────────────────────────────────────

function ScoreGauge({ score, label, size = 'lg' }: { score: number | null; label: string; size?: 'sm' | 'lg' }) {
  const radius = size === 'sm' ? 22 : 38
  const stroke = size === 'sm' ? 3 : 5
  const circumference = 2 * Math.PI * radius
  const offset = circumference - ((score ?? 0) / 100) * circumference
  const dim = (radius + stroke) * 2

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} className="-rotate-90">
          <circle
            cx={radius + stroke} cy={radius + stroke} r={radius}
            fill="none" strokeWidth={stroke}
            className="stroke-muted/20"
          />
          <circle
            cx={radius + stroke} cy={radius + stroke} r={radius}
            fill="none" strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={`transition-all duration-1000 ease-out ${
              score === null ? 'stroke-muted' :
              score >= 80 ? 'stroke-emerald-500' :
              score >= 60 ? 'stroke-amber-500' :
              score >= 40 ? 'stroke-orange-500' : 'stroke-red-500'
            }`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-mono font-bold ${size === 'lg' ? 'text-xl' : 'text-sm'} ${scoreColor(score)}`}>
            {score ?? '—'}
          </span>
          {size === 'lg' && (
            <span className="text-[0.5rem] text-muted-foreground uppercase tracking-wider">/ 100</span>
          )}
        </div>
      </div>
      <span className={`font-mono uppercase tracking-wider text-muted-foreground ${size === 'lg' ? 'text-xs' : 'text-[0.6rem]'}`}>
        {label}
      </span>
      {size === 'lg' && (
        <span className={`text-[0.6rem] font-medium ${scoreColor(score)}`}>{scoreLabel(score)}</span>
      )}
    </div>
  )
}

// ─── Check item ──────────────────────────────────────────────────────────────

function Check({ pass, label, detail }: { pass: boolean | undefined; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {pass ? (
        <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
      ) : pass === false ? (
        <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
      )}
      <div>
        <span className="text-xs text-foreground">{label}</span>
        {detail && <p className="text-[0.6rem] text-muted-foreground mt-0.5">{detail}</p>}
      </div>
    </div>
  )
}

// ─── Tech badge ──────────────────────────────────────────────────────────────

function TechBadge({ label, category }: { label: string; category: string }) {
  const colors: Record<string, string> = {
    cms: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    framework: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    analytics: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    ads: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    email: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    cdn: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    hosting: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    ecommerce: 'bg-green-500/10 text-green-400 border-green-500/20',
    other: 'bg-muted text-muted-foreground border-border',
  }

  return (
    <Badge variant="outline" className={`text-[0.6rem] ${colors[category] || colors.other}`}>
      {label}
    </Badge>
  )
}

// ─── Main report ─────────────────────────────────────────────────────────────

export default function AnalysisReport() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [generatingEmail, setGeneratingEmail] = useState(false)
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    const data = await getAnalysis(id)
    setAnalysis(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleReanalyze() {
    if (!analysis) return
    setReanalyzing(true)
    const result = await analyzeSite(analysis.url, { leadId: analysis.lead_id || undefined })
    setReanalyzing(false)
    if (result) {
      toast.success('Re-analysis complete')
      setAnalysis(result)
    } else {
      toast.error('Re-analysis failed')
    }
  }

  async function handleGenerateEmail() {
    if (!analysis) return
    setGeneratingEmail(true)
    const draft = await generateOutreachFromAnalysis(
      analysis,
      analysis.lead?.name,
      analysis.lead?.company,
    )
    setGeneratingEmail(false)
    if (draft) {
      setEmailDraft(draft)
      toast.success('Outreach email drafted')
    } else {
      toast.error('Failed to generate email')
    }
  }

  function copyEmail() {
    if (!emailDraft) return
    navigator.clipboard.writeText(`Subject: ${emailDraft.subject}\n\n${emailDraft.body}`)
    toast.success('Copied to clipboard')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Analysis not found</p>
        <Button variant="outline" onClick={() => navigate('/site-analyzer')} className="mt-4 gap-2">
          <ArrowLeft className="h-4 w-4" />Back
        </Button>
      </div>
    )
  }

  const a = analysis
  const tech = a.tech_stack || {}
  const seo = a.seo_audit || {}
  const perf = a.performance || {}
  const content = a.content_audit || {}
  const visual = a.visual_audit || {}

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/site-analyzer')} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />Back
        </Button>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Radar className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{a.domain}</h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground transition-colors">
                  <ExternalLink className="h-3 w-3" />{a.url}
                </a>
                {a.lead && (
                  <>
                    <span>·</span>
                    <span>Lead: {a.lead.company || a.lead.name}</span>
                  </>
                )}
                <span>·</span>
                <span>Analyzed {new Date(a.analyzed_at || a.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReanalyze} disabled={reanalyzing} className="gap-1.5">
            {reanalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Re-analyze
          </Button>
          <Button size="sm" onClick={handleGenerateEmail} disabled={generatingEmail} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
            {generatingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Draft Outreach
          </Button>
        </div>
      </div>

      {/* Score section */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-center gap-10">
          <ScoreGauge score={a.score_overall} label="Overall" size="lg" />
          <Separator orientation="vertical" className="h-20" />
          <ScoreGauge score={a.score_seo} label="SEO" size="sm" />
          <ScoreGauge score={a.score_performance} label="Performance" size="sm" />
          <ScoreGauge score={a.score_content} label="Content" size="sm" />
          <ScoreGauge score={a.score_visual} label="Visual" size="sm" />
        </div>
      </div>

      {/* AI Intelligence section */}
      {a.ai_summary && (
        <div className="bg-gradient-to-br from-violet-500/5 to-purple-500/5 border border-violet-500/20 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold">AI Intelligence Brief</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Summary */}
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Executive Summary</p>
              <p className="text-sm text-foreground leading-relaxed">{a.ai_summary}</p>
            </div>

            {/* Opportunities */}
            {a.ai_opportunities && (
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Sales Opportunities</p>
                <p className="text-sm text-foreground leading-relaxed">{a.ai_opportunities}</p>
              </div>
            )}

            {/* Talking Points */}
            {a.ai_talking_points && (
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Talking Points</p>
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-line">{a.ai_talking_points}</div>
              </div>
            )}

            {/* Competitor Notes */}
            {a.ai_competitor_notes && (
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Competitive Context</p>
                <p className="text-sm text-foreground leading-relaxed">{a.ai_competitor_notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Email draft */}
      {emailDraft && (
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-violet-400" />
              <h2 className="text-sm font-semibold">Generated Outreach Email</h2>
            </div>
            <Button variant="outline" size="sm" onClick={copyEmail} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />Copy
            </Button>
          </div>
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-xs font-mono text-muted-foreground mb-1">Subject</p>
            <p className="text-sm font-medium mb-3">{emailDraft.subject}</p>
            <Separator className="mb-3" />
            <p className="text-xs font-mono text-muted-foreground mb-1">Body</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{emailDraft.body}</p>
          </div>
        </div>
      )}

      {/* Detail grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tech Stack */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Server className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold">Tech Stack</h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tech.cms && <TechBadge label={tech.cms} category="cms" />}
            {tech.framework && <TechBadge label={tech.framework} category="framework" />}
            {tech.ecommerce && <TechBadge label={tech.ecommerce} category="ecommerce" />}
            {tech.cdn && <TechBadge label={tech.cdn} category="cdn" />}
            {tech.hosting && <TechBadge label={tech.hosting} category="hosting" />}
            {(tech.analytics || []).map(t => <TechBadge key={t} label={t} category="analytics" />)}
            {(tech.ads || []).map(t => <TechBadge key={t} label={t} category="ads" />)}
            {(tech.email_marketing || []).map(t => <TechBadge key={t} label={t} category="email" />)}
            {(tech.other || []).map(t => <TechBadge key={t} label={t} category="other" />)}
            {!tech.cms && !tech.framework && (tech.analytics || []).length === 0 && (
              <span className="text-xs text-muted-foreground/50">No tech detected</span>
            )}
          </div>
        </div>

        {/* SEO Audit */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold">SEO Checklist</h2>
            </div>
            <span className={`text-xs font-mono font-bold ${scoreColor(a.score_seo)}`}>{a.score_seo}/100</span>
          </div>
          <div className="flex flex-col">
            <Check pass={seo.has_meta_title} label="Meta title" detail={seo.title_text ? `"${seo.title_text}" (${seo.title_length} chars)` : undefined} />
            <Check pass={seo.has_meta_description} label="Meta description" detail={seo.description_length ? `${seo.description_length} chars` : undefined} />
            <Check pass={seo.has_og_image} label="Open Graph image" />
            <Check pass={seo.has_og_title} label="OG title" />
            <Check pass={seo.has_canonical} label="Canonical URL" />
            <Check pass={seo.has_structured_data} label="Structured data (JSON-LD)" detail={seo.structured_data_types?.join(', ')} />
            <Check pass={seo.h1_count === 1} label="Single H1 tag" detail={seo.h1_count !== undefined ? `${seo.h1_count} H1 tags found` : undefined} />
            <Check pass={seo.has_sitemap} label="Sitemap.xml" />
            <Check pass={seo.has_robots_txt} label="Robots.txt" />
          </div>
          {(seo.issues || []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs font-mono text-muted-foreground mb-2">Issues</p>
              {seo.issues!.map((issue, i) => (
                <p key={i} className="text-xs text-red-400/80 flex items-start gap-1.5 mb-1">
                  <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />{issue}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Performance */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-400" />
              <h2 className="text-sm font-semibold">Performance</h2>
            </div>
            <span className={`text-xs font-mono font-bold ${scoreColor(a.score_performance)}`}>{a.score_performance}/100</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { label: 'Speed Score', value: perf.speed_score, suffix: '/100', good: (v: number) => v >= 90, ok: (v: number) => v >= 50 },
              { label: 'Mobile Score', value: perf.mobile_score, suffix: '/100', good: (v: number) => v >= 90, ok: (v: number) => v >= 50 },
              { label: 'LCP', value: perf.lcp_ms, suffix: 'ms', good: (v: number) => v <= 2500, ok: (v: number) => v <= 4000 },
              { label: 'CLS', value: perf.cls, suffix: '', good: (v: number) => v <= 0.1, ok: (v: number) => v <= 0.25 },
              { label: 'FID', value: perf.fid_ms, suffix: 'ms', good: (v: number) => v <= 100, ok: (v: number) => v <= 300 },
              { label: 'Page Size', value: perf.total_size_kb, suffix: 'KB', good: (v: number) => v <= 1500, ok: (v: number) => v <= 3000 },
            ].map(({ label, value, suffix, good, ok }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                {value !== undefined && value !== null ? (
                  <span className={`text-xs font-mono font-medium ${good(value) ? 'text-emerald-400' : ok(value) ? 'text-amber-400' : 'text-red-400'}`}>
                    {typeof value === 'number' && value % 1 !== 0 ? value.toFixed(2) : value}{suffix}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/50">—</span>
                )}
              </div>
            ))}
          </div>
          {(perf.issues || []).length > 0 && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-mono text-muted-foreground mb-2">Issues</p>
              {perf.issues!.map((issue, i) => (
                <p key={i} className="text-xs text-orange-400/80 flex items-start gap-1.5 mb-1">
                  <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />{issue}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Content Audit */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layout className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold">Content Audit</h2>
            </div>
            <span className={`text-xs font-mono font-bold ${scoreColor(a.score_content)}`}>{a.score_content}/100</span>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-muted/20 rounded-lg">
                <p className="text-lg font-bold font-mono">{content.page_count ?? '—'}</p>
                <p className="text-[0.6rem] text-muted-foreground">Pages</p>
              </div>
              <div className="text-center p-2 bg-muted/20 rounded-lg">
                <p className="text-lg font-bold font-mono">{content.avg_word_count ?? '—'}</p>
                <p className="text-[0.6rem] text-muted-foreground">Avg Words</p>
              </div>
              <div className={`text-center p-2 rounded-lg ${(content.video_count ?? 0) === 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                <p className={`text-lg font-bold font-mono ${(content.video_count ?? 0) === 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {content.video_count ?? 0}
                </p>
                <p className="text-[0.6rem] text-muted-foreground">Videos</p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 pt-2">
              <Check pass={content.has_blog} label="Blog / News section" detail={content.blog_post_count ? `${content.blog_post_count} posts (${content.blog_frequency || 'unknown'} frequency)` : undefined} />
              <Check pass={(content.video_count ?? 0) > 0} label="Video content" detail={content.video_sources?.join(', ')} />
              <Check pass={content.has_testimonials} label="Testimonials / Reviews" />
              <Check pass={content.has_case_studies} label="Case studies / Portfolio" />
              <Check pass={content.has_pricing} label="Pricing page" />
              <Check pass={content.has_contact_form} label="Contact form" />
            </div>

            {content.social_links && content.social_links.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-mono text-muted-foreground mb-1.5">Social</p>
                <div className="flex flex-wrap gap-1">
                  {content.social_links.map(s => (
                    <Badge key={s} variant="outline" className="text-[0.6rem]">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Visual Assessment */}
        <div className="bg-card border border-border rounded-xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-pink-400" />
              <h2 className="text-sm font-semibold">Visual & Brand Assessment</h2>
            </div>
            <span className={`text-xs font-mono font-bold ${scoreColor(a.score_visual)}`}>{a.score_visual}/100</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Colors */}
            {visual.colors && visual.colors.length > 0 && (
              <div>
                <p className="text-xs font-mono text-muted-foreground mb-2">Color Palette</p>
                <div className="flex gap-1.5">
                  {visual.colors.map((c, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-md border border-border shadow-sm"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-mono text-muted-foreground mb-2">Typography</p>
              <p className="text-sm font-medium capitalize">{visual.typography || '—'}</p>
            </div>

            <div>
              <p className="text-xs font-mono text-muted-foreground mb-2">Design Era</p>
              <p className="text-sm font-medium">{visual.design_era || '—'}</p>
            </div>

            <div>
              <p className="text-xs font-mono text-muted-foreground mb-2">Features</p>
              <div className="flex flex-wrap gap-1">
                {visual.responsive && <Badge variant="outline" className="text-[0.6rem] text-emerald-400 border-emerald-500/20">Responsive</Badge>}
                {visual.dark_mode && <Badge variant="outline" className="text-[0.6rem] text-purple-400 border-purple-500/20">Dark Mode</Badge>}
                {visual.animations && <Badge variant="outline" className="text-[0.6rem] text-cyan-400 border-cyan-500/20">Animated</Badge>}
              </div>
            </div>
          </div>

          {visual.overall_impression && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-mono text-muted-foreground mb-1">Overall Impression</p>
              <p className="text-sm text-foreground/80">{visual.overall_impression}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
