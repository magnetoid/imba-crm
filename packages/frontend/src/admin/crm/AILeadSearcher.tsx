import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { buildCompanyContext, callAIJSON, getCRMRuntimeSettings } from '@/lib/ai'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import toast from 'react-hot-toast'
import { Search, Sparkles, Loader2, Building2, Mail, Globe, Phone, CheckCircle2, Plus, Download, Star, Target, History } from 'lucide-react'
import { autoScoreLead, logActivity } from './crm-utils'

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

export default function AILeadSearcher() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DiscoveredLead[]>([])
  const [importingAll, setImportingAll] = useState(false)
  const [imported, setImported] = useState<Set<number>>(new Set())
  const [searchHistory, setSearchHistory] = useState<{ label: string; count: number; date: string }[]>([])
  const [criteria, setCriteria] = useState({ industry: '', location: '', size: '', videoGoal: '', keywords: '', count: '10' })

  useEffect(() => { void loadHistory() }, [])

  async function loadHistory() {
    const { data } = await supabase.from('crm_ai_settings').select('value').eq('key', 'lead_search_history').maybeSingle()
    if (data?.value) setSearchHistory((data.value as { searches: typeof searchHistory }).searches || [])
  }

  async function search() {
    if (!criteria.industry) return toast.error('Select an industry.')
    setLoading(true)
    setResults([])
    setImported(new Set())
    try {
      const runtime = await getCRMRuntimeSettings()
      const prompt = `You are a B2B lead researcher for Imba Production.\n${buildCompanyContext(runtime)}\n\nGenerate ${criteria.count} realistic internal prospecting leads. Prefer plausible targets with clear reasons they may need premium video production.\n\nCriteria:\n- Industry: ${criteria.industry}\n- Location: ${criteria.location || 'Global / US / Europe'}\n- Company size: ${criteria.size || 'Any'}\n- Video goal: ${criteria.videoGoal || 'Brand awareness'}\n- Keywords: ${criteria.keywords || 'growth-stage, digital-first'}\n\nReturn ONLY valid JSON array:\n[{"company_name":"string","contact_name":"string","email":"string","phone":"string","website":"string","industry":"string","company_size":"string","ai_score":75,"ai_summary":"string"}]`
      const leads = await callAIJSON<DiscoveredLead[]>(prompt, { maxTokens: 1800 })
      setResults(leads)
      const label = `${criteria.industry} · ${criteria.location || 'Global'}`
      const entry = { label, count: leads.length, date: new Date().toISOString() }
      const next = [entry, ...searchHistory].slice(0, 8)
      setSearchHistory(next)
      await supabase.from('crm_ai_settings').upsert({ key: 'lead_search_history', value: { searches: next } })
      toast.success(`Found ${leads.length} leads`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI search failed')
    }
    setLoading(false)
  }

  async function importLead(lead: DiscoveredLead, idx: number) {
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
    if (error) return toast.error(`Failed: ${error.message}`)
    setImported(prev => new Set([...prev, idx]))
    toast.success(`${lead.company_name} added to CRM`)
    if (inserted) {
      logActivity(inserted.id, 'note', 'Imported from AI Lead Finder', lead.ai_summary || '')
      autoScoreLead(inserted).catch(() => {})
    }
  }

  async function importAll() {
    setImportingAll(true)
    let count = 0
    for (let i = 0; i < results.length; i++) {
      if (imported.has(i)) continue
      const lead = results[i]
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
      if (!error) {
        setImported(prev => new Set([...prev, i]))
        count++
        if (inserted) {
          logActivity(inserted.id, 'note', 'Imported from AI Lead Finder', lead.ai_summary || '')
          autoScoreLead(inserted).catch(() => {})
        }
      }
    }
    toast.success(`${count} leads imported to CRM`)
    setImportingAll(false)
  }

  const scoreColor = (s: number) => s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-amber-400' : 'text-muted-foreground'

  return <div className="p-8 max-w-6xl mx-auto">{/* unchanged UI */}
    <div className="flex items-center gap-3 mb-1"><Target className="h-5 w-5 text-amber-500" /><h1 className="text-2xl font-semibold">AI Lead Finder</h1></div>
    <p className="text-muted-foreground text-sm mb-8">Describe your ideal client. The CRM uses the server-side AI proxy to generate targeted leads you can import immediately.</p>
    <div className="bg-card border border-border rounded-lg p-6 mb-8">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <div className="flex flex-col gap-1.5"><Label>Industry *</Label><Select value={criteria.industry} onValueChange={v => setCriteria(p => ({ ...p, industry: v }))}><SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger><SelectContent>{INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex flex-col gap-1.5"><Label>Location</Label><Input value={criteria.location} onChange={e => setCriteria(p => ({ ...p, location: e.target.value }))} placeholder="US, Germany, UK…" /></div>
        <div className="flex flex-col gap-1.5"><Label>Company size</Label><Select value={criteria.size} onValueChange={v => setCriteria(p => ({ ...p, size: v }))}><SelectTrigger><SelectValue placeholder="Any size" /></SelectTrigger><SelectContent>{SIZES.map(s => <SelectItem key={s} value={s}>{s} employees</SelectItem>)}</SelectContent></Select></div>
        <div className="flex flex-col gap-1.5"><Label>Video goal</Label><Select value={criteria.videoGoal} onValueChange={v => setCriteria(p => ({ ...p, videoGoal: v }))}><SelectTrigger><SelectValue placeholder="Any goal" /></SelectTrigger><SelectContent>{GOALS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex flex-col gap-1.5"><Label>Keywords</Label><Input value={criteria.keywords} onChange={e => setCriteria(p => ({ ...p, keywords: e.target.value }))} placeholder="startup, DTC, B2B…" /></div>
        <div className="flex flex-col gap-1.5"><Label>Number of leads</Label><Select value={criteria.count} onValueChange={v => setCriteria(p => ({ ...p, count: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['5', '10', '15', '20'].map(n => <SelectItem key={n} value={n}>{n} leads</SelectItem>)}</SelectContent></Select></div>
      </div>
      <Button onClick={search} disabled={loading} className="gap-2 bg-amber-500 hover:bg-amber-600 text-black">{loading ? <><Loader2 className="h-4 w-4 animate-spin" />Searching…</> : <><Sparkles className="h-4 w-4" />Find leads with AI</>}</Button>
    </div>
    {results.length > 0 && <><div className="flex items-center justify-between mb-4"><p className="text-sm text-muted-foreground">{results.length} leads found · {imported.size} imported</p><Button variant="outline" size="sm" onClick={importAll} disabled={importingAll || imported.size === results.length} className="gap-2">{importingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Import all to CRM</Button></div><div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{results.map((lead, i) => <div key={i} className={`bg-card border rounded-lg p-5 transition-all ${imported.has(i) ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border hover:border-amber-500/30'}`}><div className="flex items-start justify-between gap-3 mb-3"><div className="flex items-center gap-2.5"><div className="w-9 h-9 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0"><Building2 className="h-4 w-4 text-amber-500" /></div><div><p className="font-medium text-sm">{lead.company_name}</p><p className="text-xs text-muted-foreground">{lead.contact_name}</p></div></div><div className="flex items-center gap-2"><div className="flex items-center gap-1"><Star className={`h-3.5 w-3.5 ${scoreColor(lead.ai_score)}`} /><span className={`text-sm font-mono font-medium ${scoreColor(lead.ai_score)}`}>{lead.ai_score}</span></div>{imported.has(i) ? <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 text-xs gap-1"><CheckCircle2 className="h-3 w-3" /> Imported</Badge> : <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => importLead(lead, i)}><Plus className="h-3 w-3" /> Import</Button>}</div></div><div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">{lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>}{lead.website && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{lead.website}</span>}{lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}</div><div className="flex gap-2 mb-3"><Badge variant="secondary" className="text-xs">{lead.industry}</Badge>{lead.company_size && <Badge variant="secondary" className="text-xs">{lead.company_size} employees</Badge>}</div><p className="text-xs text-muted-foreground leading-relaxed">{lead.ai_summary}</p></div>)}</div></>}
    {searchHistory.length > 0 && results.length === 0 && !loading && <div className="mt-8"><Separator className="mb-6" /><div className="flex items-center gap-2 mb-4"><History className="h-3.5 w-3.5 text-muted-foreground" /><p className="text-xs font-mono tracking-widest uppercase text-muted-foreground/50">Recent searches</p></div><div className="flex flex-col gap-2">{searchHistory.map((s, i) => <div key={i} className="flex items-center justify-between text-sm text-muted-foreground bg-card border border-border rounded px-3 py-2"><span className="flex items-center gap-2"><Search className="h-3.5 w-3.5" />{s.label}</span><span className="text-xs">{s.count} leads · {new Date(s.date).toLocaleDateString()}</span></div>)}</div></div>}
  </div>
}
