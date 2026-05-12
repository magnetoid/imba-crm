// Signals module — Phase 10.3.
// Two tabs: Feed (recent crm_signals) + Routes (operator-editable rules).

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { Badge } from '@imba/shared/ui/badge'
import { Loader2, Radio, Rss, Briefcase, Newspaper, Wrench, ExternalLink, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@imba/shared/ui/select'
import { Input } from '@imba/shared/ui/input'
import { Label } from '@imba/shared/ui/label'
import toast from 'react-hot-toast'

interface SignalRow {
  id: string
  lead_id: string | null
  company_id: string | null
  kind: string
  source: string
  headline: string | null
  url: string | null
  captured_at: string
  crm_leads?: { id: string; name: string; company: string | null } | null
  crm_companies?: { id: string; name: string } | null
}

interface RouteRow {
  id: string
  name: string
  when_kind: string
  when_filter: Record<string, unknown>
  then_action: Record<string, unknown>
  is_active: boolean
  position: number
  fired_count: number
}

const KIND_META: Record<string, { icon: typeof Rss; label: string; color: string }> = {
  funding_announced: { icon: Rss,        label: 'Funding',       color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  hiring_post:       { icon: Briefcase,  label: 'Hiring',        color: 'text-amber-700 bg-amber-50 border-amber-200' },
  news_mention:      { icon: Newspaper,  label: 'News',          color: 'text-blue-700 bg-blue-50 border-blue-200' },
  tech_added:        { icon: Wrench,     label: 'Tech added',    color: 'text-violet-700 bg-violet-50 border-violet-200' },
  tech_removed:      { icon: Wrench,     label: 'Tech removed',  color: 'text-slate-700 bg-slate-50 border-slate-200' },
  social_post:       { icon: Radio,      label: 'Social',        color: 'text-pink-700 bg-pink-50 border-pink-200' },
  custom:            { icon: Radio,      label: 'Custom',        color: 'text-slate-700 bg-slate-50 border-slate-200' },
}

type Tab = 'feed' | 'routes'

export default function SignalsModule() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'feed'
    const h = window.location.hash.replace('#', '') as Tab
    return h === 'routes' ? 'routes' : 'feed'
  })
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash !== `#${tab}`) {
      window.history.replaceState(null, '', `#${tab}`)
    }
  }, [tab])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Radio className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Signals</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Real-world events that should trigger outbound — funding rounds, key hires, news mentions, tech-stack changes.
        The route_signal trigger fans them out to the right agent or sequence based on rules you control.
      </p>

      <div className="flex flex-wrap gap-1 mb-6 border-b border-border">
        {(['feed', 'routes'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 -mb-px text-sm font-medium transition-colors border-b-2 ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >{t === 'feed' ? 'Feed' : 'Routes'}</button>
        ))}
      </div>

      {tab === 'feed'   ? <SignalsFeed />   : null}
      {tab === 'routes' ? <SignalsRoutes /> : null}
    </div>
  )
}

function SignalsFeed() {
  const [signals, setSignals] = useState<SignalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [kindFilter, setKindFilter] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('crm_signals')
      .select('id, lead_id, company_id, kind, source, headline, url, captured_at, crm_leads(id, name, company), crm_companies(id, name)')
      .order('captured_at', { ascending: false })
      .limit(200)
    if (kindFilter) q = q.eq('kind', kindFilter)
    const { data } = await q
    setSignals((data as unknown as SignalRow[] | null) ?? [])
    setLoading(false)
  }, [kindFilter])
  useEffect(() => { void load() }, [load])

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setKindFilter(null)}
          className={`text-xs px-3 py-1 rounded-full border transition-all font-mono ${!kindFilter ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}
        >All</button>
        {Object.entries(KIND_META).map(([k, m]) => {
          const active = kindFilter === k
          return (
            <button
              key={k}
              onClick={() => setKindFilter(active ? null : k)}
              className={`text-xs px-3 py-1 rounded-full border transition-all flex items-center gap-1 ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}
            >
              <m.icon className="h-3 w-3" />
              {m.label}
            </button>
          )
        })}
        <Button size="sm" variant="ghost" onClick={() => void load()} className="ml-auto">Refresh</Button>
      </div>

      {signals.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Radio className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-4">No signals yet. Wire a signal source — funding rounds, hiring posts, news — and the feed populates here.</p>
          <a href="/admin/crm/settings#integrations" className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            Configure Integrations →
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map(s => {
            const meta = KIND_META[s.kind] ?? KIND_META.custom
            const Icon = meta.icon
            return (
              <div key={s.id} className="bg-card border border-border rounded-lg p-4 flex items-start gap-3 shadow-sm">
                <div className={`px-2 py-0.5 rounded-full text-[11px] font-mono border flex items-center gap-1 flex-shrink-0 ${meta.color}`}>
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.headline ?? '(no headline)'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.crm_leads ? (
                      <Link to={`/admin/crm/${s.crm_leads.id}`} className="hover:underline text-primary">
                        {s.crm_leads.name}{s.crm_leads.company ? ` · ${s.crm_leads.company}` : ''}
                      </Link>
                    ) : s.crm_companies ? (
                      <span>{s.crm_companies.name}</span>
                    ) : (
                      <span className="italic">unmatched</span>
                    )}
                    {' · '}{s.source}{' · '}{new Date(s.captured_at).toLocaleString()}
                  </p>
                </div>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                     className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 flex-shrink-0">
                    <ExternalLink className="h-3 w-3" /> source
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SignalsRoutes() {
  const [routes, setRoutes] = useState<RouteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<RouteRow | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_signal_routes')
      .select('id, name, when_kind, when_filter, then_action, is_active, position, fired_count')
      .order('position', { ascending: true })
    setRoutes((data as RouteRow[] | null) ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function toggleActive(r: RouteRow) {
    await supabase.from('crm_signal_routes').update({ is_active: !r.is_active }).eq('id', r.id)
    void load()
  }
  async function deleteRoute(id: string) {
    if (!window.confirm('Delete this route?')) return
    await supabase.from('crm_signal_routes').delete().eq('id', id)
    void load()
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Rules evaluated in order. The first matching rule whose filter passes fires its action.
        </p>
        <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5"><SettingsIcon className="h-3.5 w-3.5" /> New route</Button>
      </div>

      <div className="space-y-2">
        {routes.map(r => {
          const meta = KIND_META[r.when_kind] ?? KIND_META.custom
          return (
            <div key={r.id} className={`bg-card border border-border rounded-lg p-4 flex items-start gap-3 shadow-sm ${r.is_active ? '' : 'opacity-60'}`}>
              <div className={`px-2 py-0.5 rounded-full text-[11px] font-mono border flex items-center gap-1 flex-shrink-0 ${meta.color}`}>
                <meta.icon className="h-3 w-3" />
                {meta.label}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{r.name}</p>
                  {r.fired_count > 0 && <Badge variant="secondary" className="text-[10px]">fired {r.fired_count}×</Badge>}
                  {!r.is_active && <Badge variant="outline" className="text-[10px] text-muted-foreground">paused</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  When <span className="font-mono">{describeFilter(r.when_filter)}</span>
                  {' '}then <span className="font-mono">{describeAction(r.then_action)}</span>
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(r)}>Edit</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void toggleActive(r)}>
                  {r.is_active ? 'Pause' : 'Resume'}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-700" onClick={() => void deleteRoute(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {(editing || creating) && (
        <RouteEditor
          route={editing}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSaved={() => { setEditing(null); setCreating(false); void load() }}
        />
      )}
    </div>
  )
}

function describeFilter(f: Record<string, unknown>): string {
  const parts: string[] = []
  if (f.fit_min    != null) parts.push(`fit ≥ ${f.fit_min}`)
  if (f.intent_min != null) parts.push(`intent ≥ ${f.intent_min}`)
  if (Array.isArray(f.stage_in)) parts.push(`stage ∈ ${f.stage_in.join(',')}`)
  if (Array.isArray(f.tag_any))  parts.push(`tags ∋ ${f.tag_any.join(',')}`)
  return parts.length ? parts.join(' · ') : 'any lead'
}

function describeAction(a: Record<string, unknown>): string {
  const t = a.type as string | undefined
  if (t === 'enqueue_agent')  return `queue ${a.kind} agent`
  if (t === 'start_sequence') return `start sequence`
  if (t === 'hot_alert')      return `fire hot-lead alert`
  if (t === 'add_tag')        return `add tag #${a.tag}`
  return JSON.stringify(a)
}

function RouteEditor({ route, onClose, onSaved }: { route: RouteRow | null; onClose: () => void; onSaved: () => void }) {
  const [name,       setName]       = useState(route?.name ?? '')
  const [whenKind,   setWhenKind]   = useState(route?.when_kind ?? 'funding_announced')
  const [fitMin,     setFitMin]     = useState<string>(String(route?.when_filter.fit_min ?? ''))
  const [intentMin,  setIntentMin]  = useState<string>(String(route?.when_filter.intent_min ?? ''))
  const [actionType, setActionType] = useState<string>((route?.then_action.type as string) ?? 'hot_alert')
  const [actionVal,  setActionVal]  = useState<string>(
    actionTypeToVal(route?.then_action ?? { type: 'hot_alert' })
  )
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) { toast.error('name required'); return }
    setSaving(true)
    const filter: Record<string, unknown> = {}
    if (fitMin)    filter.fit_min    = parseInt(fitMin)
    if (intentMin) filter.intent_min = parseInt(intentMin)
    let action: Record<string, unknown>
    if (actionType === 'enqueue_agent') {
      action = { type: 'enqueue_agent', kind: actionVal || 'outreach-drafter' }
    } else if (actionType === 'start_sequence') {
      action = { type: 'start_sequence', sequence_id: actionVal }
    } else if (actionType === 'add_tag') {
      action = { type: 'add_tag', tag: actionVal || 'signal' }
    } else {
      action = { type: 'hot_alert', reason: actionVal || `${name} fired` }
    }
    const payload = { name: name.trim(), when_kind: whenKind, when_filter: filter, then_action: action }
    const op = route
      ? supabase.from('crm_signal_routes').update(payload).eq('id', route.id)
      : supabase.from('crm_signal_routes').insert(payload)
    const { error } = await op
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(route ? 'Route updated' : 'Route created')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg max-w-lg w-full p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4">{route ? 'Edit route' : 'New route'}</h2>
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder='e.g. "Funding raise → fast follow-up"' />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>When signal kind</Label>
            <Select value={whenKind} onValueChange={setWhenKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label} ({k})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Min fit_score (0-100, optional)</Label>
              <Input type="number" min={0} max={100} value={fitMin} onChange={e => setFitMin(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Min intent_score (0-100, optional)</Label>
              <Input type="number" min={0} max={100} value={intentMin} onChange={e => setIntentMin(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Then action</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hot_alert">Fire hot-lead alert</SelectItem>
                <SelectItem value="enqueue_agent">Queue agent</SelectItem>
                <SelectItem value="start_sequence">Start sequence</SelectItem>
                <SelectItem value="add_tag">Add tag</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>
              {actionType === 'enqueue_agent'  ? 'Agent kind (e.g. outreach-drafter)' :
               actionType === 'start_sequence' ? 'Sequence id (uuid)' :
               actionType === 'add_tag'        ? 'Tag name (no #)' :
                                                 'Alert reason template'}
            </Label>
            <Input value={actionVal} onChange={e => setActionVal(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
        </div>
      </div>
    </div>
  )
}

function actionTypeToVal(a: Record<string, unknown>): string {
  if (a.type === 'enqueue_agent')  return (a.kind as string) ?? 'outreach-drafter'
  if (a.type === 'start_sequence') return (a.sequence_id as string) ?? ''
  if (a.type === 'add_tag')        return (a.tag as string) ?? 'signal'
  return (a.reason as string) ?? ''
}
