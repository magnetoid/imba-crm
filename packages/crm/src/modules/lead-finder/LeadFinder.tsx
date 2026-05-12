import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Label } from '@imba/shared/ui/label'
import { Textarea } from '@imba/shared/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@imba/shared/ui/select'
import { Switch } from '@imba/shared/ui/switch'
import toast from 'react-hot-toast'
import {
  Search, Sparkles, Loader2, Building2, Mail, Globe, Phone, CheckCircle2,
  Target, FileSpreadsheet, Bot, AlertCircle,
  MapPin, Zap, Trash2, ExternalLink, Download,
} from 'lucide-react'

type Tab = 'search' | 'csv' | 'apify'

const TABS: Array<{ id: Tab; label: string; icon: typeof Sparkles; description: string }> = [
  { id: 'search', label: 'Search',      icon: Zap,            description: 'Real prospects from Google Maps + auto-enriched emails' },
  { id: 'csv',    label: 'CSV import',  icon: FileSpreadsheet, description: 'Paste a list from anywhere' },
  { id: 'apify',  label: 'Advanced',    icon: Bot,            description: 'Raw Apify actor + JSON input (power users)' },
]

export default function AILeadSearcher() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'search'
    const h = window.location.hash.replace('#', '') as Tab
    return TABS.some(t => t.id === h) ? h : 'search'
  })
  // Power-user toggle reveals the "Advanced" tab. Off by default — the
  // ~1% of operators who need raw Apify JSON can flip it on.
  const [showAdvanced, setShowAdvanced] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('lead_finder_show_advanced') === '1'
  })
  useEffect(() => {
    try { localStorage.setItem('lead_finder_show_advanced', showAdvanced ? '1' : '0') } catch { /* */ }
  }, [showAdvanced])
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash !== `#${tab}`) {
      window.history.replaceState(null, '', `#${tab}`)
    }
  }, [tab])
  // If user toggles off Advanced while on the Apify tab, bounce back to Search.
  useEffect(() => {
    if (!showAdvanced && tab === 'apify') setTab('search')
  }, [showAdvanced, tab])

  const visibleTabs = TABS.filter(t => t.id !== 'apify' || showAdvanced)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Target className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Lead Finder</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Find real prospects on Google Maps (with auto-enriched emails), or paste a list you already have. ICP rules + scoring live in <a href="/admin/crm/settings#icp" className="text-primary hover:underline">Settings → ICP rules</a>.
      </p>

      {/* Tab nav */}
      <div className="flex flex-wrap items-center gap-1 mb-8 border-b border-border">
        {visibleTabs.map(t => {
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
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showAdvanced}
            onChange={e => setShowAdvanced(e.target.checked)}
            className="accent-primary"
          />
          Power user
        </label>
      </div>

      {tab === 'search' && <SmartSearchPane />}
      {tab === 'csv'    && <CsvImportPane />}
      {tab === 'apify'  && <ApifyPane />}
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

// Curated niche presets — one tap instead of "what do I type here?".
// Covers the 90% of B2B prospecting hops Google Maps reliably returns
// for. Each entry has the emoji + the actual search keyword that
// flows into the actor's searchStringsArray.
const NICHE_PRESETS: Array<{ emoji: string; label: string; keyword: string }> = [
  { emoji: '💼', label: 'Marketing agency',  keyword: 'marketing agency' },
  { emoji: '🦷', label: 'Dentist',           keyword: 'dentist' },
  { emoji: '🏠', label: 'Real estate',       keyword: 'real estate agency' },
  { emoji: '⚖️', label: 'Law firm',           keyword: 'law firm' },
  { emoji: '🍴', label: 'Restaurant',         keyword: 'restaurant' },
  { emoji: '💪', label: 'Gym',                keyword: 'gym' },
  { emoji: '🏨', label: 'Hotel',              keyword: 'hotel' },
  { emoji: '💼', label: 'Accountant',         keyword: 'accountant' },
  { emoji: '🚗', label: 'Car dealer',         keyword: 'car dealership' },
  { emoji: '💇', label: 'Salon / spa',        keyword: 'beauty salon' },
  { emoji: '🏥', label: 'Medical clinic',     keyword: 'medical clinic' },
  { emoji: '🎬', label: 'Production company', keyword: 'video production company' },
]

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
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([])
  const [elapsedSec, setElapsedSec] = useState(0)
  // Per-step progress: rows of crm_agent_runs scoped to the active
  // job. Each row is a step the worker logged via ctx.step() — the
  // step_name + status + decision_summary make "what is the job doing
  // right now" visible inline.
  const [activeSteps, setActiveSteps] = useState<Array<{
    id: string
    step_no: number
    step_name: string
    status: string
    decision_summary: string | null
    started_at: string
    finished_at: string | null
  }>>([])

  // ── Load ICP rules + check Apify creds + recent jobs ──────────────
  const loadRecentJobs = useCallback(async () => {
    const { data } = await supabase
      .from('crm_agent_jobs')
      .select('id, status, output, error, created_at, input')
      .eq('agent_kind', 'lead-finder')
      .eq('triggered_by', 'smart-search')
      .order('created_at', { ascending: false })
      .limit(6)
    setRecentJobs((data as RecentJob[] | null) ?? [])
  }, [])
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('crm_runtime_settings').select('icp_rules').eq('id', 1).maybeSingle()
      setIcp(((data as { icp_rules?: IcpRulesLite } | null)?.icp_rules) ?? null)
      const { data: providers } = await supabase.rpc('list_provider_credentials')
      const apify = (providers as Array<{ provider: string; has_key: boolean }> | null)?.find(p => p.provider === 'apify')
      setApifyConfigured(!!apify?.has_key)
      void loadRecentJobs()
    })()
  }, [loadRecentJobs])

  // Elapsed-time ticker while a search is in flight. Updates the status
  // banner so the operator sees the apify run progressing, not a frozen
  // spinner.
  useEffect(() => {
    if (!activeJob || ['finished', 'failed', 'cancelled'].includes(activeJob.status)) {
      setElapsedSec(0); return
    }
    const start = new Date(activeJob.created_at).getTime()
    const t = setInterval(() => setElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [activeJob])

  // Use ICP defaults — pre-fills niche + country from the saved ICP rules.
  function useIcpDefaults() {
    if (!icp) { toast('Set ICP rules in Settings first', { icon: 'ℹ️' }); return }
    const firstIndustry = icp.industries?.[0]
    const firstCountry  = icp.countries?.[0]
    if (firstIndustry) setNiche(firstIndustry)
    if (firstCountry)  setCountry(firstCountry)
    if (!firstIndustry && !firstCountry) toast('Your ICP has no industries or countries yet')
    else toast.success(`Pre-filled from ICP: ${[firstIndustry, firstCountry].filter(Boolean).join(' / ')}`)
  }

  // Re-run a previous search by lifting its criteria back into the form.
  function rerunFromHistory(j: RecentJob) {
    const ai = (j.input.actor_input as { searchStringsArray?: string[] } | undefined)
    const search = ai?.searchStringsArray?.[0] ?? ''
    if (!search) { toast.error('Could not parse this run'); return }
    // The string is "<niche> <city> <country>" joined by spaces; we just
    // dump it into the niche field so the operator can split it manually
    // — simpler than trying to reverse-engineer the parts.
    setNiche(search)
    setCity('')
    setCountry('')
    toast.success('Loaded criteria — adjust and search again')
  }

  // ── Poll active job + per-step runs until finished ───────────────
  useEffect(() => {
    if (!activeJob) return
    if (activeJob.status === 'finished' || activeJob.status === 'failed' || activeJob.status === 'cancelled') return
    const t = setInterval(async () => {
      const [{ data: jobData }, { data: stepData }] = await Promise.all([
        supabase.from('crm_agent_jobs')
          .select('id, status, output, error, created_at, input')
          .eq('id', activeJob.id).maybeSingle(),
        supabase.from('crm_agent_runs')
          .select('id, step_no, step_name, status, decision_summary, started_at, finished_at')
          .eq('job_id', activeJob.id)
          .order('step_no', { ascending: true }),
      ])
      if (jobData) setActiveJob(jobData as RecentJob)
      setActiveSteps((stepData as typeof activeSteps | null) ?? [])
    }, 2000)
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
      void loadRecentJobs()      // surface this run in history immediately
    })()
  }, [activeJob, searchStartedAt, loadRecentJobs])

  async function search() {
    if (!niche.trim()) return toast.error('Niche / industry required.')
    if (!apifyConfigured) {
      toast.error('Apify API key missing. Add it under Settings → AI providers.')
      return
    }
    setQueueing(true)
    setResults([])
    setActiveSteps([])
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
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2.5">
        <Zap className="h-4 w-4 text-emerald-700 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-emerald-900">
          <strong>Real prospects from Google Maps.</strong> Pick a niche + location → we scrape, dedupe, save real businesses (with phone + website). Auto-enrich finds the verified email + decision-maker title.
        </p>
      </div>

      {apifyConfigured === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-900">
            No Apify API key found. Go to <a href="/admin/crm/settings#integrations" className="font-semibold underline">Settings → Integrations</a>, pick <code>apify</code>, and paste your token. Free tier covers ~$5/mo of actor runs.
          </div>
        </div>
      )}

      {/* Form */}
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        {/* Quick-pick niche presets — one tap fills the field. */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Quick picks</Label>
            <button
              type="button"
              onClick={useIcpDefaults}
              className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              title="Pre-fill from your ICP rules (Settings → ICP)"
            >
              <Sparkles className="h-3 w-3" /> Use my ICP defaults
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {NICHE_PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => setNiche(p.keyword)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  niche.toLowerCase() === p.keyword.toLowerCase()
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
              >
                <span className="mr-1">{p.emoji}</span>{p.label}
              </button>
            ))}
          </div>
        </div>

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
              {NICHE_PRESETS.map(p => <option key={p.keyword} value={p.keyword} />)}
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

      {/* Job status banner + per-step progress */}
      {activeJob && (
        <div className={`rounded-lg border ${
          finished ? 'bg-emerald-50 border-emerald-200'
            : failed ? 'bg-red-50 border-red-200'
            : 'bg-blue-50 border-blue-200'
        }`}>
          <div className="p-4 flex items-center gap-3 text-sm">
            {isRunning && <Loader2 className="h-4 w-4 animate-spin text-blue-700" />}
            {finished && <CheckCircle2 className="h-4 w-4 text-emerald-700" />}
            {failed && <AlertCircle className="h-4 w-4 text-red-700" />}
            <span className="font-mono text-xs">job {activeJob.id.slice(0, 8)}</span>
            <span>{activeJob.status}</span>
            {isRunning && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono">{elapsedSec}s elapsed</span>
              </>
            )}
            {finished && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{out.items_scraped ?? 0} scraped → {savedCount} saved</span>
                {out.enrichment_enqueued ? <span className="text-muted-foreground">· {out.enrichment_enqueued} enrichments queued</span> : null}
              </>
            )}
            {failed && activeJob.error && <span className="text-red-700 truncate max-w-md">{activeJob.error}</span>}
          </div>

          {/* Per-step trace. Renders the live progression so the
              operator sees exactly what the worker is doing right
              now: run-actor (scraping) → dedupe → save-leads →
              enqueue-enrichment. Each step shows its decision_summary
              the moment the worker writes it. */}
          {activeSteps.length > 0 && (
            <div className="border-t border-border/50 px-4 py-3 space-y-1.5">
              {activeSteps.map(s => {
                const running = s.status === 'running'
                const done    = s.status === 'done'
                const failedS = s.status === 'failed'
                const awaiting = s.status === 'awaiting_approval'
                const elapsed = s.finished_at
                  ? Math.round((new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 1000)
                  : Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000)
                return (
                  <div key={s.id} className="flex items-start gap-2 text-xs">
                    <span className="flex-shrink-0 w-5 mt-0.5">
                      {done     && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      {running  && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}
                      {failedS  && <AlertCircle className="h-3.5 w-3.5 text-red-600" />}
                      {awaiting && <AlertCircle className="h-3.5 w-3.5 text-amber-600" />}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground w-32 truncate flex-shrink-0">{s.step_name}</span>
                    <span className="flex-1 leading-relaxed">
                      {s.decision_summary ?? (running ? '…working' : s.status)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono flex-shrink-0">{elapsed}s</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Recent searches — re-run with one click */}
      {recentJobs.length > 0 && results.length === 0 && !activeJob && (
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Recent searches</p>
          <div className="space-y-1.5">
            {recentJobs.map(j => {
              const ai = j.input.actor_input as { searchStringsArray?: string[] } | undefined
              const q = ai?.searchStringsArray?.[0] ?? '(no query)'
              const o = (j.output ?? {}) as { saved?: { leads?: number } }
              const saved = o?.saved?.leads ?? 0
              return (
                <button
                  key={j.id}
                  onClick={() => rerunFromHistory(j)}
                  className="w-full flex items-center gap-3 text-left text-xs p-2 rounded hover:bg-muted/60 transition-colors group"
                >
                  <StatusDot status={j.status} />
                  <span className="flex-1 truncate font-mono">{q}</span>
                  {saved > 0 && <span className="text-emerald-700 font-mono">{saved} saved</span>}
                  <span className="text-muted-foreground/70 text-[10px]">{new Date(j.created_at).toLocaleDateString()}</span>
                  <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100">Re-run →</span>
                </button>
              )
            })}
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

