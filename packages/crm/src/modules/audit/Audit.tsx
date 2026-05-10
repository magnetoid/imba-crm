import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@imba/shared/ui/badge'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Separator } from '@imba/shared/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@imba/shared/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@imba/shared/ui/select'
import { listRecentGenerations, type AIFeature, type AIGeneration } from '@/lib/aiGenerations'
import { History, Loader2, RefreshCw, Search, Eye, AlertCircle, CheckCircle2, Clock } from 'lucide-react'

const FEATURES: Array<{ key: 'all' | AIFeature; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'outreach_email', label: 'Outreach email' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'lead_score', label: 'Lead score' },
  { key: 'lead_enrich', label: 'Lead enrich' },
  { key: 'lead_search', label: 'Lead search' },
  { key: 'inbox_analyze', label: 'Inbox analyze' },
  { key: 'inbox_reply_suggest', label: 'Inbox reply' },
  { key: 'analytics_insights', label: 'Analytics' },
]

const STATUS_META: Record<string, { label: string; color: string }> = {
  logged:   { label: 'Logged',   color: 'text-muted-foreground' },
  draft:    { label: 'Draft',    color: 'text-blue-700' },
  edited:   { label: 'Edited',   color: 'text-cyan-400' },
  approved: { label: 'Approved', color: 'text-emerald-700' },
  rejected: { label: 'Rejected', color: 'text-red-700' },
  sent:     { label: 'Sent',     color: 'text-violet-700' },
}

function formatCost(cents: number | null): string {
  if (cents == null) return '—'
  if (cents < 0.1) return '<$0.001'
  return `$${(cents / 100).toFixed(4)}`
}

function formatTokens(tin: number | null, tout: number | null): string {
  if (tin == null && tout == null) return '—'
  return `${tin ?? 0} → ${tout ?? 0}`
}

function truncate(text: string | null | undefined, n: number): string {
  if (!text) return ''
  return text.length > n ? `${text.slice(0, n)}…` : text
}

export default function AIAudit() {
  const [rows, setRows] = useState<AIGeneration[]>([])
  const [loading, setLoading] = useState(true)
  const [featureFilter, setFeatureFilter] = useState<'all' | AIFeature>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | AIGeneration['status']>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AIGeneration | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setRows(await listRecentGenerations(200))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (featureFilter !== 'all' && r.feature !== featureFilter) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (search) {
        const needle = search.toLowerCase()
        const hay = [r.feature, r.task_type, r.output_text, r.input_text, r.error_text, r.model, r.provider]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [rows, featureFilter, statusFilter, search])

  const totals = useMemo(() => {
    const approved = rows.filter(r => r.status === 'approved' || r.status === 'sent').length
    const rejected = rows.filter(r => r.status === 'rejected').length
    const failed = rows.filter(r => r.error_text).length
    const costCents = rows.reduce((s, r) => s + (r.cost_cents ?? 0), 0)
    return { total: rows.length, approved, rejected, failed, costCents }
  }, [rows])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-amber-500" />
          <h1 className="text-2xl font-semibold">AI Audit</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Every AI generation is logged here with its input, output, model, cost, and approval state.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="Total" value={totals.total.toString()} />
        <Stat label="Approved / sent" value={totals.approved.toString()} color="text-emerald-700" />
        <Stat label="Rejected" value={totals.rejected.toString()} color="text-red-700" />
        <Stat label="Failed" value={totals.failed.toString()} color={totals.failed > 0 ? 'text-amber-700' : undefined} />
        <Stat label="Cost (recent)" value={formatCost(totals.costCents)} color="text-violet-700" />
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search input/output…"
            className="pl-8 h-9 text-sm w-64"
          />
        </div>
        <Select value={featureFilter} onValueChange={v => setFeatureFilter(v as typeof featureFilter)}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FEATURES.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator className="mb-5" />

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No generations match the current filters.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(row => {
            const meta = STATUS_META[row.status] ?? STATUS_META.logged
            const hasError = Boolean(row.error_text)
            return (
              <button
                key={row.id}
                onClick={() => setSelected(row)}
                className="text-left bg-card border border-border rounded-lg p-4 hover:border-border/60 transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    {hasError
                      ? <AlertCircle className="h-3.5 w-3.5 text-red-700" />
                      : row.status === 'sent' || row.status === 'approved'
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                        : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                    <Badge variant="outline" className="text-xs">{row.feature}</Badge>
                    <Badge variant="outline" className="text-xs text-muted-foreground">{row.task_type}</Badge>
                    {row.model && <span className="text-xs font-mono text-muted-foreground">{row.model}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                    <span>{formatTokens(row.tokens_in, row.tokens_out)}</span>
                    <span>{formatCost(row.cost_cents)}</span>
                    <span className={meta.color}>{meta.label}</span>
                    <span>{new Date(row.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {hasError ? row.error_text : truncate(row.output_text, 180) || <em className="text-muted-foreground/60">(no output)</em>}
                </p>
              </button>
            )
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-500" />
              {selected?.feature} · {selected?.task_type}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-5 py-2 text-sm">
              <GridRow label="Model" value={selected.model ?? '—'} />
              <GridRow label="Provider" value={selected.provider ?? '—'} />
              <GridRow label="Tokens" value={formatTokens(selected.tokens_in, selected.tokens_out)} />
              <GridRow label="Cost" value={formatCost(selected.cost_cents)} />
              <GridRow label="Status" value={STATUS_META[selected.status]?.label ?? selected.status} />
              <GridRow label="Created" value={new Date(selected.created_at).toLocaleString()} />
              {selected.approved_at && (
                <GridRow label="Approved at" value={new Date(selected.approved_at).toLocaleString()} />
              )}

              <Section title="Input">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/20 border border-border rounded p-3 max-h-64 overflow-y-auto">
                  {selected.input_text}
                </pre>
              </Section>

              {selected.output_text && (
                <Section title="Output">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/20 border border-border rounded p-3 max-h-64 overflow-y-auto">
                    {selected.output_text}
                  </pre>
                </Section>
              )}

              {selected.final_content && selected.final_content !== selected.output_text && (
                <Section title="Final content (post-edit)">
                  <pre className="text-xs text-emerald-300/80 whitespace-pre-wrap font-mono bg-emerald-50 border border-emerald-500/20 rounded p-3 max-h-64 overflow-y-auto">
                    {selected.final_content}
                  </pre>
                </Section>
              )}

              {selected.error_text && (
                <Section title="Error">
                  <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono bg-red-50 border border-red-500/20 rounded p-3 max-h-64 overflow-y-auto">
                    {selected.error_text}
                  </pre>
                </Section>
              )}

              {Object.keys(selected.input_meta ?? {}).length > 0 && (
                <Section title="Input metadata">
                  <pre className="text-xs text-muted-foreground/80 whitespace-pre-wrap font-mono bg-muted/20 border border-border rounded p-3 max-h-48 overflow-y-auto">
                    {JSON.stringify(selected.input_meta, null, 2)}
                  </pre>
                </Section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3">
      <p className={`text-2xl font-mono font-bold ${color ?? 'text-foreground'}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}

function GridRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground uppercase tracking-widest font-mono">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground/50 mb-1.5">{title}</p>
      {children}
    </div>
  )
}
