import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@imba/shared/supabase'
import { buildCompanyContext, callAIJSON, getCRMRuntimeSettings } from '@imba/shared/lib/ai'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Label } from '@imba/shared/ui/label'
import { Badge } from '@imba/shared/ui/badge'
import { Textarea } from '@imba/shared/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@imba/shared/ui/select'
import { Separator } from '@imba/shared/ui/separator'
import { Switch } from '@imba/shared/ui/switch'
import toast from 'react-hot-toast'
import {
  Search, Sparkles, Loader2, Building2, Mail, Globe, Phone, CheckCircle2, Plus,
  Download, Star, Target, History, FileSpreadsheet, Bot, Sliders, AlertCircle,
  MapPin, Zap, Trash2, ExternalLink,
} from 'lucide-react'
import { autoScoreLead, logActivity } from '@/lib/crm-utils'
import { logGeneration } from '@/lib/aiGenerations'

interface DiscoveredLead {
  company_name: string
  contact_name: string
  email: string
  phone: string
  website: string
  industry: string
  company_size: string
  ai_score: number
  ai_summary: string
}

const INDUSTRIES = ['E-commerce & Retail', 'SaaS & Tech', 'Real Estate', 'Healthcare', 'Food & Beverage', 'Fashion & Beauty', 'Education & eLearning', 'Finance & Fintech', 'Hospitality & Travel', 'Manufacturing', 'Non-Profit', 'Legal & Professional Services', 'Entertainment & Media']
const SIZES = ['1–10', '11–50', '51–200', '201–500', '500+']
const GOALS = ['brand awareness', 'product launch', 'lead generation', 'investor pitch', 'social media content', 'eLearning / training']

type Tab = 'smart' | 'ai' | 'csv' | 'apify' | 'icp'

const TABS: Array<{ id: Tab; label: string; icon: typeof Sparkles; description: string }> = [
  { id: 'smart', label: 'Smart search', icon: Zap,            description: 'Real prospects from Google Maps + auto-enriched emails' },
  { id: 'ai',    label: 'AI brainstorm', icon: Sparkles,      description: 'LLM-imagined prospects (not verified)' },
  { id: 'csv',   label: 'CSV import',  icon: FileSpreadsheet, description: 'Paste a list from anywhere' },
  { id: 'apify', label: 'Apify advanced', icon: Bot,          description: 'Raw Apify actor + JSON input' },
  { id: 'icp',   label: 'ICP rules',   icon: Sliders,         description: 'Define what a fit-100 lead looks like' },
]

export default function AILeadSearcher() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'smart'
    const h = window.location.hash.replace('#', '') as Tab
    return TABS.some(t => t.id === h) ? h : 'smart'
  })
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash !== `#${tab}`) {
      window.history.replaceState(null, '', `#${tab}`)
    }
  }, [tab])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Target className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Lead Finder</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Build your prospect list four ways: imagine with AI, paste a CSV, run a real-search actor, or sharpen the ICP rules that score every lead.
      </p>

      {/* Tab nav */}
      <div className="flex flex-wrap gap-1 mb-8 border-b border-border">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 -mb-px text-sm font-medium transition-colors border-b-2 ${
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'smart' && <SmartSearchPane />}
      {tab === 'ai'    && <AISearchPane />}
      {tab === 'csv'   && <CsvImportPane />}
      {tab === 'apify' && <ApifyPane />}
      {tab === 'icp'   && <IcpRulesPane />}
    </div>
  )
}

// ── 0. Smart search (Apify Google-Maps-backed real prospecting) ───────
// Wraps the lead-finder agent in a friendly form. Operator picks a niche,
// city, country, and count — we build the Apify Google-Maps-scraper
// input automatically, queue the agent, and poll for results. With
// auto-enrich on, every saved lead also gets a lead-enricher job so the
// emails land verified (Hunter) and titles backfilled (Apollo).
interface IcpRulesLite { industries?: string[]; countries?: string[]; titles_must_match?: string[] }

interface FoundLead {
  id: string
  name: string | null
  company: string | null
  email: string | null
  phone: string | null
  website: string | null
  linkedin_url: string | null
  notes: string | null
  created_at: string
}

interface RecentJob {
  id: string
  status: string
  output: Record<string, unknown> | null
  error: string | null
  created_at: string
  input: Record<string, unknown>
}

function SmartSearchPane() {
  const [niche, setNiche]         = useState('')
  const [city, setCity]           = useState('')
  const [country, setCountry]     = useState('')
  const [maxResults, setMaxResults] = useState(50)
  const [autoEnrich, setAutoEnrich] = useState(true)
  const [icp, setIcp] = useState<IcpRulesLite | null>(null)
  const [queueing, setQueueing] = useState(false)
  const [activeJob, setActiveJob] = useState<RecentJob | null>(null)
  const [searchStartedAt, setSearchStartedAt] = useState<string | null>(null)
  const [results, setResults] = useState<FoundLead[]>([])
  const [apifyConfigured, setApifyConfigured] = useState<boolean | null>(null)

  // ── Load ICP rules + check Apify creds ────────────────────────────
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('crm_runtime_settings').select('icp_rules').eq('id', 1).maybeSingle()
      setIcp(((data as { icp_rules?: IcpRulesLite } | null)?.icp_rules) ?? null)
      // Provider credentials are RLS-restricted to service_role — read
      // through the security-definer RPC instead.
      const { data: providers } = await supabase.rpc('list_provider_credentials')
      const apify = (providers as Array<{ provider: string; has_key: boolean }> | null)?.find(p => p.provider === 'apify')
      setApifyConfigured(!!apify?.has_key)
    })()
  }, [])

  // ── Poll active job until finished, then load saved leads ─────────
  useEffect(() => {
    if (!activeJob) return
    if (activeJob.status === 'finished' || activeJob.status === 'failed' || activeJob.status === 'cancelled') return
    const t = setInterval(async () => {
      const { data } = await supabase
        .from('crm_agent_jobs')
        .select('id, status, output, error, created_at, input')
        .eq('id', activeJob.id)
        .maybeSingle()
      if (data) setActiveJob(data as RecentJob)
    }, 2500)
    return () => clearInterval(t)
  }, [activeJob])

  useEffect(() => {
    if (!activeJob || !searchStartedAt) return
    if (activeJob.status !== 'finished') return
    void (async () => {
      const { data } = await supabase
        .from('crm_leads')
        .select('id, name, company, email, phone, website, linkedin_url, notes, created_at')
        .eq('source', 'lead-finder')
        .gte('created_at', searchStartedAt)
        .order('created_at', { ascending: false })
        .limit(200)
      setResults((data as FoundLead[] | null) ?? [])
    })()
  }, [activeJob, searchStartedAt])

  async function search() {
    if (!niche.trim()) return toast.error('Niche / industry required.')
    if (!apifyConfigured) {
      toast.error('Apify API key missing. Add it under Settings → AI providers.')
      return
    }
    setQueueing(true)
    setResults([])
    const startedAt = new Date().toISOString()
    setSearchStartedAt(startedAt)
    const searchString = [niche.trim(), city.trim(), country.trim()].filter(Boolean).join(' ')
    const { data, error } = await supabase
      .from('crm_agent_jobs')
      .insert({
        agent_kind: 'lead-finder',
        input: {
          // compass/crawler-google-places is the current "Google Maps
          // Scraper" on Apify. The old apify/google-maps-scraper id no
          // longer resolves.
          actor_id: 'compass/crawler-google-places',
          actor_input: {
            searchStringsArray: [searchString],
            maxCrawledPlacesPerSearch: maxResults,
            language: 'en',
            scrapeContacts: true,
            skipClosedPlaces: true,
          },
          max_save: maxResults,
          auto_enrich: autoEnrich,
        },
        triggered_by: 'smart-search',
      })
      .select('id, status, output, error, created_at, input')
      .single()
    setQueueing(false)
    if (error || !data) return toast.error(error?.message ?? 'failed to queue search')
    setActiveJob(data as RecentJob)
    toast.success('Searching real prospects — results land here as they arrive.')
  }

  async function deleteLead(id: string) {
    const { error } = await supabase.from('crm_leads').delete().eq('id', id)
    if (error) return toast.error(error.message)
    setResults(rs => rs.filter(r => r.id !== id))
  }

  const isRunning = activeJob && ['queued', 'running', 'awaiting_approval'].includes(activeJob.status)
  const finished  = activeJob?.status === 'finished'
  const failed    = activeJob?.status === 'failed' || activeJob?.status === 'cancelled'
  const out       = (activeJob?.output ?? {}) as { saved?: { companies?: number; leads?: number }; items_scraped?: number; enrichment_enqueued?: number }
  const savedCount = out?.saved?.leads ?? 0

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
        <Zap className="h-4 w-4 text-emerald-700 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-emerald-900">
          <strong>Real prospects, not LLM guesses.</strong> Smart search runs the <code>apify/google-maps-scraper</code> actor
          for your niche + location, dedupes by domain, saves to your CRM, and (with auto-enrich on) fans out
          <code> lead-enricher</code> jobs to find verified emails via Hunter + person details via Apollo.
        </div>
      </div>

      {apifyConfigured === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-900">
            No Apify API key found. Go to <strong>Settings → AI providers</strong>, pick <code>apify</code>, and paste your token. Free tier covers ~$5/mo of actor runs.
          </div>
        </div>
      )}

      {/* Form */}
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <Label>Niche / industry *</Label>
            <Input
              value={niche}
              onChange={e => setNiche(e.target.value)}
              list="niche-suggestions"
              placeholder="dentist, marketing agency, real estate, hotel…"
            />
            <datalist id="niche-suggestions">
              {(icp?.industries ?? []).map(i => <option key={i} value={i} />)}
              <option value="dentist" />
              <option value="marketing agency" />
              <option value="real estate agency" />
              <option value="restaurant" />
              <option value="law firm" />
              <option value="accounting firm" />
              <option value="hotel" />
              <option value="gym" />
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>City</Label>
            <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Belgrade" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Country</Label>
            <Input
              value={country}
              onChange={e => setCountry(e.target.value)}
              list="country-suggestions"
              placeholder="Serbia"
            />
            <datalist id="country-suggestions">
              {(icp?.countries ?? []).map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Max results</Label>
            <Select value={String(maxResults)} onValueChange={v => setMaxResults(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 lg:col-span-3">
            <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-md px-3 py-2">
              <Switch checked={autoEnrich} onCheckedChange={setAutoEnrich} id="auto-enrich" />
              <Label htmlFor="auto-enrich" className="text-xs cursor-pointer">
                Auto-enrich (Hunter email + Apollo title — needs creds)
              </Label>
            </div>
          </div>
        </div>
        <Button onClick={search} disabled={queueing || isRunning || !niche.trim()} className="gap-2">
          {queueing || isRunning
            ? <><Loader2 className="h-4 w-4 animate-spin" />{isRunning ? `Status: ${activeJob.status}…` : 'Queueing…'}</>
            : <><Search className="h-4 w-4" />Find real prospects</>}
        </Button>
        <p className="text-[11px] text-muted-foreground mt-3">
          Tip: be specific. <code>"law firm Berlin Germany"</code> beats <code>"law"</code>. Add a niche modifier (luxury, B2B, vegan, …) if the list is too broad.
        </p>
      </div>

      {/* Job status banner */}
      {activeJob && (
        <div className={`rounded-lg p-4 border flex items-center justify-between ${
          finished ? 'bg-emerald-50 border-emerald-200'
            : failed ? 'bg-red-50 border-red-200'
            : 'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-center gap-3 text-sm">
            {isRunning && <Loader2 className="h-4 w-4 animate-spin text-blue-700" />}
            {finished && <CheckCircle2 className="h-4 w-4 text-emerald-700" />}
            {failed && <AlertCircle className="h-4 w-4 text-red-700" />}
            <span className="font-mono text-xs">job {activeJob.id.slice(0, 8)}</span>
            <span>{activeJob.status}</span>
            {finished && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{out.items_scraped ?? 0} scraped → {savedCount} saved</span>
                {out.enrichment_enqueued ? <span className="text-muted-foreground">· {out.enrichment_enqueued} enrichments queued</span> : null}
              </>
            )}
            {failed && activeJob.error && <span className="text-red-700 truncate max-w-md">{activeJob.error}</span>}
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">{results.length} leads in CRM from this search</p>
            <Button variant="outline" size="sm" onClick={() => { setActiveJob(null); setResults([]); setSearchStartedAt(null) }}>
              Clear
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {results.map(l => (
              <div key={l.id} className="bg-card border border-border rounded-lg p-4 shadow-sm flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{l.company ?? l.name ?? '(unnamed)'}</p>
                      {l.name && l.name !== l.company && <p className="text-xs text-muted-foreground truncate">{l.name}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteLead(l.id)}
                    title="Remove from CRM"
                    className="text-muted-foreground hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {l.email   && <span className="flex items-center gap-1"><Mail   className="h-3 w-3" />{l.email}</span>}
                  {l.phone   && <span className="flex items-center gap-1"><Phone  className="h-3 w-3" />{l.phone}</span>}
                  {l.website && (
                    <a href={l.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary">
                      <Globe className="h-3 w-3" />{l.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
                {l.notes && (
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed line-clamp-2">
                    <MapPin className="h-3 w-3 inline mr-1 -mt-0.5" />{l.notes}
                  </p>
                )}
                {!l.email && autoEnrich && (
                  <p className="text-[10px] text-amber-700 mt-2">Email pending — enrichment job is finding it.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state hint */}
      {!activeJob && results.length === 0 && (
        <div className="text-center text-xs text-muted-foreground py-8">
          <Target className="h-4 w-4 mx-auto mb-2 opacity-50" />
          Pick a niche + city and click <strong>Find real prospects</strong>.
        </div>
      )}
    </div>
  )
}

// ── 1. AI search (legacy LLM-imagine flow) ────────────────────────────
function AISearchPane() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DiscoveredLead[]>([])
  const [importingAll, setImportingAll] = useState(false)
  const [imported, setImported] = useState<Set<number>>(new Set())
  const [searchHistory, setSearchHistory] = useState<{ label: string; count: number; date: string }[]>([])
  const [criteria, setCriteria] = useState({ industry: '', location: '', size: '', videoGoal: '', keywords: '', count: '10' })

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from('crm_ai_settings').select('value').eq('key', 'lead_search_history').maybeSingle()
    if (data?.value) setSearchHistory((data.value as { searches: typeof searchHistory }).searches || [])
  }, [])
  useEffect(() => { void loadHistory() }, [loadHistory])

  async function search() {
    if (!criteria.industry) return toast.error('Select an industry.')
    setLoading(true); setResults([]); setImported(new Set())
    const runtime = await getCRMRuntimeSettings()
    const prompt = `You are a B2B lead researcher for ${runtime.company_name || 'our team'}.\n${buildCompanyContext(runtime)}\n\nGenerate ${criteria.count} realistic prospecting leads. Prefer plausible targets with clear reasons they may need our services.\n\nCriteria:\n- Industry: ${criteria.industry}\n- Location: ${criteria.location || 'Global / US / Europe'}\n- Company size: ${criteria.size || 'Any'}\n- Goal: ${criteria.videoGoal || 'Brand awareness'}\n- Keywords: ${criteria.keywords || 'growth-stage, digital-first'}\n\nReturn ONLY valid JSON array:\n[{"company_name":"string","contact_name":"string","email":"string","phone":"string","website":"string","industry":"string","company_size":"string","ai_score":75,"ai_summary":"string"}]`
    try {
      const leads = await callAIJSON<DiscoveredLead[]>(prompt, { maxTokens: 1800 })
      setResults(leads)
      const entry = { label: `${criteria.industry} · ${criteria.location || 'Global'}`, count: leads.length, date: new Date().toISOString() }
      const next = [entry, ...searchHistory].slice(0, 8)
      setSearchHistory(next)
      await supabase.from('crm_ai_settings').upsert({ key: 'lead_search_history', value: { searches: next } })
      void logGeneration({ feature: 'lead_search', taskType: 'research', input: prompt, output: JSON.stringify(leads), inputMeta: { criteria }, provider: runtime.active_ai_provider, model: runtime.active_ai_model })
      toast.success(`Found ${leads.length} leads`)
    } catch (error) {
      void logGeneration({ feature: 'lead_search', taskType: 'research', input: prompt, error: error instanceof Error ? error.message : String(error), inputMeta: { criteria } })
      toast.error(error instanceof Error ? error.message : 'AI search failed')
    }
    setLoading(false)
  }

  async function insertLead(lead: DiscoveredLead): Promise<{ ok: boolean; id?: string; err?: string }> {
    const { data: inserted, error } = await supabase.from('crm_leads').insert({
      name: lead.contact_name || lead.company_name,
      company: lead.company_name,
      email: lead.email,
      phone: lead.phone,
      website: lead.website,
      service_interest: 'Video production',
      notes: `Industry: ${lead.industry || 'N/A'} | Company size: ${lead.company_size || 'N/A'}\n${lead.ai_summary || ''}`.trim(),
      ai_score: lead.ai_score,
      ai_notes: lead.ai_summary,
      source: 'ai_search',
      stage: 'new',
      probability: Math.min(100, Math.max(0, lead.ai_score || 50)),
    }).select('id, name, company, service_interest, source, notes').single()
    if (error) return { ok: false, err: error.message }
    if (inserted) {
      logActivity(inserted.id, 'note', 'Imported from AI Lead Finder', lead.ai_summary || '')
      autoScoreLead(inserted).catch(() => {})
    }
    return { ok: true, id: inserted?.id }
  }

  async function importLead(lead: DiscoveredLead, idx: number) {
    const r = await insertLead(lead)
    if (!r.ok) return toast.error(`Failed: ${r.err}`)
    setImported(p => new Set([...p, idx]))
    toast.success(`${lead.company_name} added to CRM`)
  }

  async function importAll() {
    setImportingAll(true)
    let count = 0
    for (let i = 0; i < results.length; i++) {
      if (imported.has(i)) continue
      const r = await insertLead(results[i])
      if (r.ok) { setImported(p => new Set([...p, i])); count++ }
    }
    toast.success(`${count} leads imported to CRM`)
    setImportingAll(false)
  }

  const scoreColor = (s: number) => s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-amber-600' : 'text-muted-foreground'

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-6 mb-8 shadow-sm">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
          <div className="flex flex-col gap-1.5"><Label>Industry *</Label><Select value={criteria.industry} onValueChange={v => setCriteria(p => ({ ...p, industry: v }))}><SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger><SelectContent>{INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex flex-col gap-1.5"><Label>Location</Label><Input value={criteria.location} onChange={e => setCriteria(p => ({ ...p, location: e.target.value }))} placeholder="US, Germany, UK…" /></div>
          <div className="flex flex-col gap-1.5"><Label>Company size</Label><Select value={criteria.size} onValueChange={v => setCriteria(p => ({ ...p, size: v }))}><SelectTrigger><SelectValue placeholder="Any size" /></SelectTrigger><SelectContent>{SIZES.map(s => <SelectItem key={s} value={s}>{s} employees</SelectItem>)}</SelectContent></Select></div>
          <div className="flex flex-col gap-1.5"><Label>Goal</Label><Select value={criteria.videoGoal} onValueChange={v => setCriteria(p => ({ ...p, videoGoal: v }))}><SelectTrigger><SelectValue placeholder="Any goal" /></SelectTrigger><SelectContent>{GOALS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex flex-col gap-1.5"><Label>Keywords</Label><Input value={criteria.keywords} onChange={e => setCriteria(p => ({ ...p, keywords: e.target.value }))} placeholder="startup, DTC, B2B…" /></div>
          <div className="flex flex-col gap-1.5"><Label>Number of leads</Label><Select value={criteria.count} onValueChange={v => setCriteria(p => ({ ...p, count: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['5', '10', '15', '20'].map(n => <SelectItem key={n} value={n}>{n} leads</SelectItem>)}</SelectContent></Select></div>
        </div>
        <Button onClick={search} disabled={loading} className="gap-2">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Searching…</> : <><Sparkles className="h-4 w-4" />Find leads with AI</>}
        </Button>
        <p className="text-[11px] text-muted-foreground mt-3">
          Heads-up: AI search synthesises *plausible* prospects — they're a starting point, not verified contacts. For verified data use Real search (Apify) or CSV import.
        </p>
      </div>

      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">{results.length} leads found · {imported.size} imported</p>
            <Button variant="outline" size="sm" onClick={importAll} disabled={importingAll || imported.size === results.length} className="gap-2">
              {importingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Import all to CRM
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {results.map((lead, i) => (
              <div key={i} className={`bg-card border rounded-lg p-5 shadow-sm transition-all ${imported.has(i) ? 'border-emerald-300 bg-emerald-50/40' : 'border-border hover:border-primary/40'}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0"><Building2 className="h-4 w-4 text-primary" /></div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{lead.company_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{lead.contact_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1"><Star className={`h-3.5 w-3.5 ${scoreColor(lead.ai_score)}`} /><span className={`text-sm font-mono font-medium ${scoreColor(lead.ai_score)}`}>{lead.ai_score}</span></div>
                    {imported.has(i)
                      ? <Badge variant="outline" className="text-emerald-700 border-emerald-300 text-xs gap-1"><CheckCircle2 className="h-3 w-3" /> Imported</Badge>
                      : <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => importLead(lead, i)}><Plus className="h-3 w-3" /> Import</Button>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
                  {lead.email   && <span className="flex items-center gap-1"><Mail   className="h-3 w-3" />{lead.email}</span>}
                  {lead.website && <span className="flex items-center gap-1"><Globe  className="h-3 w-3" />{lead.website}</span>}
                  {lead.phone   && <span className="flex items-center gap-1"><Phone  className="h-3 w-3" />{lead.phone}</span>}
                </div>
                <div className="flex gap-2 mb-3">
                  <Badge variant="secondary" className="text-xs">{lead.industry}</Badge>
                  {lead.company_size && <Badge variant="secondary" className="text-xs">{lead.company_size} employees</Badge>}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{lead.ai_summary}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {searchHistory.length > 0 && results.length === 0 && !loading && (
        <div className="mt-8">
          <Separator className="mb-6" />
          <div className="flex items-center gap-2 mb-4">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground/60">Recent searches</p>
          </div>
          <div className="flex flex-col gap-2">
            {searchHistory.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm text-muted-foreground bg-card border border-border rounded px-3 py-2">
                <span className="flex items-center gap-2"><Search className="h-3.5 w-3.5" />{s.label}</span>
                <span className="text-xs font-mono">{s.count} leads · {new Date(s.date).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ── 2. CSV import ─────────────────────────────────────────────────────
// Operator pastes a CSV/TSV from anywhere (LinkedIn export, Apollo CSV,
// hand-rolled list). We sniff the delimiter, parse the first header row,
// let the operator map columns to lead fields, then bulk-insert.
function CsvImportPane() {
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] }>({ headers: [], rows: [] })
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState<{ ok: number; failed: number } | null>(null)

  const FIELDS = [
    { key: 'name',     label: 'Contact name', required: false },
    { key: 'email',    label: 'Email',        required: true  },
    { key: 'company',  label: 'Company',      required: false },
    { key: 'website',  label: 'Website',      required: false },
    { key: 'phone',    label: 'Phone',        required: false },
    { key: 'title',    label: 'Title',        required: false },
    { key: 'linkedin', label: 'LinkedIn URL', required: false },
    { key: 'notes',    label: 'Notes',        required: false },
  ] as const

  function parse() {
    const text = raw.trim()
    if (!text) return setParsed({ headers: [], rows: [] })
    // Detect delimiter from header row.
    const head = text.split(/\r?\n/)[0] ?? ''
    const delim = head.includes('\t') ? '\t' : head.includes(',') ? ',' : ','
    const lines = text.split(/\r?\n/).filter(Boolean)
    if (lines.length === 0) return setParsed({ headers: [], rows: [] })
    const headers = splitLine(lines[0], delim)
    const rows = lines.slice(1).map(l => splitLine(l, delim))
    setParsed({ headers, rows })
    // Auto-guess mapping from header names.
    const nextMap: Record<string, string> = {}
    for (const f of FIELDS) {
      const guess = headers.find(h => normalize(h).includes(normalize(f.key)) || normalize(h).includes(normalize(f.label)))
      if (guess) nextMap[f.key] = guess
    }
    if (!nextMap.email) {
      const e = headers.find(h => /e[-_ ]?mail/i.test(h))
      if (e) nextMap.email = e
    }
    setMapping(nextMap)
  }

  async function importAll() {
    if (!mapping.email) return toast.error('You must map an "email" column.')
    setImporting(true)
    setDone(null)
    let ok = 0, failed = 0
    for (const row of parsed.rows) {
      const get = (k: string) => {
        const col = mapping[k]
        if (!col) return undefined
        const i = parsed.headers.indexOf(col)
        return i >= 0 ? row[i] : undefined
      }
      const email = (get('email') || '').trim().toLowerCase()
      if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) { failed++; continue }
      const { data: existing } = await supabase.from('crm_leads').select('id').eq('email', email).maybeSingle()
      if (existing) { ok++; continue }   // dedupe
      const { error } = await supabase.from('crm_leads').insert({
        name: get('name') || get('company') || email,
        email,
        company: get('company') || null,
        website: get('website') || null,
        phone: get('phone') || null,
        title: get('title') || null,
        linkedin_url: get('linkedin') || null,
        notes: get('notes') || null,
        source: 'csv_import',
        stage: 'new',
        probability: 50,
      })
      if (error) failed++; else ok++
    }
    setImporting(false)
    setDone({ ok, failed })
    if (ok > 0) toast.success(`Imported ${ok} leads`)
    if (failed > 0) toast.error(`${failed} failed (bad/missing email)`)
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <Label className="mb-2 block">Paste CSV or TSV (with header row)</Label>
        <Textarea
          value={raw}
          onChange={e => setRaw(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder={`name,email,company,website\nJane Doe,jane@acme.com,Acme,https://acme.com`}
        />
        <div className="flex items-center gap-2 mt-3">
          <Button onClick={parse} variant="outline" size="sm">Parse</Button>
          <span className="text-xs text-muted-foreground">
            {parsed.rows.length > 0 ? `${parsed.rows.length} rows · ${parsed.headers.length} columns` : 'No rows yet'}
          </span>
        </div>
      </div>

      {parsed.headers.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <h3 className="font-medium mb-1">Map columns</h3>
          <p className="text-xs text-muted-foreground mb-4">Pick which CSV column feeds each CRM field. Email is required.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            {FIELDS.map(f => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label className="text-xs">
                  {f.label} {f.required && <span className="text-destructive">*</span>}
                </Label>
                <Select value={mapping[f.key] ?? '__none__'} onValueChange={v => setMapping(m => ({ ...m, [f.key]: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="(none)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">(none)</SelectItem>
                    {parsed.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button onClick={importAll} disabled={importing || !mapping.email} className="gap-2">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Import {parsed.rows.length} rows
          </Button>
          {done && (
            <div className="mt-4 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{done.ok} imported, {done.failed} skipped (dedupe or invalid email)</span>
            </div>
          )}
        </div>
      )}

      {parsed.rows.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm overflow-x-auto">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Preview (first 5 rows)</p>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border">{parsed.headers.map(h => <th key={h} className="text-left py-1.5 px-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {parsed.rows.slice(0, 5).map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {r.map((c, j) => <td key={j} className="py-1.5 px-2 text-muted-foreground">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function splitLine(line: string, delim: string): string[] {
  // Light CSV split — respects double-quoted fields containing the delimiter.
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { q = !q; continue }
    if (c === delim && !q) { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur)
  return out.map(s => s.trim())
}

function normalize(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, '') }

// ── 3. Apify-backed real search ───────────────────────────────────────
// Queues a `lead-finder` agent job. The worker picks it up, runs the
// actor, dedupes by domain, and saves crm_companies + crm_leads.
function ApifyPane() {
  const [actorId, setActorId] = useState('compass/crawler-google-places')
  const [maxSave, setMaxSave] = useState(50)
  const [actorInput, setActorInput] = useState('{\n  "searchStringsArray": ["dentist Belgrade"],\n  "maxCrawledPlacesPerSearch": 50\n}')
  const [queueing, setQueueing] = useState(false)
  const [recent, setRecent] = useState<Array<{ id: string; status: string; created_at: string; output: Record<string, unknown> | null }>>([])

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from('crm_agent_jobs')
      .select('id, status, created_at, output')
      .eq('agent_kind', 'lead-finder')
      .order('created_at', { ascending: false })
      .limit(8)
    setRecent((data as typeof recent | null) ?? [])
  }, [])
  useEffect(() => { void loadRecent(); const t = setInterval(loadRecent, 4000); return () => clearInterval(t) }, [loadRecent])

  async function queue() {
    let parsed: unknown
    try { parsed = JSON.parse(actorInput) } catch { return toast.error('actor input is not valid JSON') }
    setQueueing(true)
    const { error } = await supabase.from('crm_agent_jobs').insert({
      agent_kind: 'lead-finder',
      input: { actor_id: actorId, actor_input: parsed, max_save: maxSave },
      triggered_by: 'lead-finder-ui',
    })
    setQueueing(false)
    if (error) return toast.error(error.message)
    toast.success('Queued — the worker will pick it up shortly.')
    void loadRecent()
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0"><Bot className="h-5 w-5 text-primary" /></div>
          <div>
            <h3 className="font-medium mb-1">Run an Apify actor</h3>
            <p className="text-xs text-muted-foreground">
              The worker queues your actor (LinkedIn scraper, Google Maps, Yelp, custom site crawl, …),
              dedupes results by company domain, and writes <code className="text-xs">crm_companies</code> + <code className="text-xs">crm_leads</code> rows.
              Configure the Apify API key under Settings → AI providers (provider <code>apify</code>).
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-1.5">
            <Label>Actor ID</Label>
            <Input value={actorId} onChange={e => setActorId(e.target.value)} placeholder="compass/crawler-google-places" />
            <p className="text-[10px] text-muted-foreground">Paste from <code>apify.com/store/&lt;actor&gt;</code> as <code>username/actor</code>.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Max leads to save</Label>
            <Input type="number" min={1} max={500} value={maxSave} onChange={e => setMaxSave(Math.max(1, Math.min(500, Number(e.target.value) || 50)))} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 mb-5">
          <Label>Actor input (JSON)</Label>
          <Textarea value={actorInput} onChange={e => setActorInput(e.target.value)} rows={8} className="font-mono text-xs" />
        </div>
        <Button onClick={queue} disabled={queueing || !actorId} className="gap-2">
          {queueing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
          Queue lead-finder run
        </Button>
      </div>

      {recent.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">Recent runs</p>
          <div className="space-y-2">
            {recent.map(r => {
              const o = r.output ?? {}
              const saved = (o as { saved?: number }).saved
              return (
                <div key={r.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <StatusDot status={r.status} />
                    <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">{r.status}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {saved != null ? `${saved} saved · ` : ''}{new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const c = status === 'finished' ? 'bg-emerald-500'
    : status === 'failed' || status === 'cancelled' ? 'bg-red-500'
    : status === 'running' ? 'bg-blue-500'
    : status === 'awaiting_approval' ? 'bg-amber-500'
    : 'bg-slate-400'
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} />
}

// ── 4. ICP rules editor ──────────────────────────────────────────────
// Edits crm_runtime_settings.icp_rules — the same JSON the lead-scorer
// agent reads to compute fit_score on every lead.
interface IcpRules {
  industries?: string[]
  employee_min?: number
  employee_max?: number
  countries?: string[]
  titles_must_match?: string[]
  tech_must_match?: string[]
  tech_block?: string[]
}

function IcpRulesPane() {
  const [rules, setRules] = useState<IcpRules>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('crm_runtime_settings').select('icp_rules').eq('id', 1).maybeSingle()
    setRules(((data as { icp_rules?: IcpRules } | null)?.icp_rules) ?? {})
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('crm_runtime_settings').update({ icp_rules: rules }).eq('id', 1)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('ICP rules saved — fit_score will recompute on next lead-scorer run.')
  }

  function toCsv(arr: string[] | undefined): string { return (arr ?? []).join(', ') }
  function fromCsv(s: string): string[] { return s.split(',').map(x => x.trim()).filter(Boolean) }

  const summary = useMemo(() => {
    const bits: string[] = []
    if (rules.industries?.length)        bits.push(`${rules.industries.length} industries`)
    if (rules.titles_must_match?.length) bits.push(`${rules.titles_must_match.length} target titles`)
    if (rules.countries?.length)         bits.push(`${rules.countries.length} countries`)
    if (rules.tech_must_match?.length)   bits.push(`${rules.tech_must_match.length} tech keywords`)
    if (rules.tech_block?.length)        bits.push(`${rules.tech_block.length} tech blocked`)
    if (rules.employee_min || rules.employee_max) bits.push(`size ${rules.employee_min ?? 0}-${rules.employee_max ?? '∞'}`)
    return bits.length ? bits.join(' · ') : 'No rules yet — every lead scores 50/100 by default.'
  }, [rules])

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-amber-900">
          These rules drive <strong>fit_score</strong> (0–100). The Pipeline sorts by fit × intent so the lead the rep should call next floats to the top.
          <div className="mt-1 font-mono">{summary}</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Target industries (comma-separated)</Label>
            <Input value={toCsv(rules.industries)} onChange={e => setRules(r => ({ ...r, industries: fromCsv(e.target.value) }))} placeholder="saas, ecommerce, real estate" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Target countries</Label>
            <Input value={toCsv(rules.countries)} onChange={e => setRules(r => ({ ...r, countries: fromCsv(e.target.value) }))} placeholder="US, UK, DE, RS" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Target titles (must match)</Label>
            <Input value={toCsv(rules.titles_must_match)} onChange={e => setRules(r => ({ ...r, titles_must_match: fromCsv(e.target.value) }))} placeholder="founder, ceo, cmo, marketing, head, vp" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tech in stack (boost)</Label>
            <Input value={toCsv(rules.tech_must_match)} onChange={e => setRules(r => ({ ...r, tech_must_match: fromCsv(e.target.value) }))} placeholder="shopify, hubspot, segment" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tech blocklist (auto-disqualify)</Label>
            <Input value={toCsv(rules.tech_block)} onChange={e => setRules(r => ({ ...r, tech_block: fromCsv(e.target.value) }))} placeholder="wordpress.com, wix" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Employee count range</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} value={rules.employee_min ?? 0} onChange={e => setRules(r => ({ ...r, employee_min: Number(e.target.value) || 0 }))} placeholder="min" />
              <span className="text-muted-foreground">–</span>
              <Input type="number" min={0} value={rules.employee_max ?? 5000} onChange={e => setRules(r => ({ ...r, employee_max: Number(e.target.value) || 0 }))} placeholder="max" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save ICP rules
          </Button>
          <Button variant="outline" onClick={load} disabled={saving} size="sm">Revert</Button>
        </div>
      </div>
    </div>
  )
}
