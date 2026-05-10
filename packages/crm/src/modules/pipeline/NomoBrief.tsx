// Nomo Daily Brief — sits at the top of the Pipeline page.
// Pulls a compact summary from /api/nomo/brief and renders an
// at-a-glance headline + 4 stats + ≤4 actionable bullets.
//
// Each action carries a `prompt` the worker pre-composed; clicking
// the button fires the `nomo:open` CustomEvent that CRMLayout listens
// for, opening the side panel with the prompt ready in the composer.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Sparkles, Send, ChevronRight } from 'lucide-react'
import { Button } from '@imba/shared/ui/button'
import { supabase } from '@imba/shared/supabase'

interface BriefStat   { label: string; value: string; hint?: string }
interface BriefAction { text: string; prompt: string; severity: 'info' | 'warning' | 'success' }
interface Brief {
  headline: string
  stats: BriefStat[]
  actions: BriefAction[]
  generated_at: string
  model?: string
}

const CACHE_KEY = 'nomo_brief_today_v1'

// Shared between Pipeline mounts so we don't refetch on every route hit.
function loadCached(): Brief | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Brief
    // Drop if older than 30 minutes.
    if (Date.now() - new Date(parsed.generated_at).getTime() > 30 * 60_000) return null
    return parsed
  } catch { return null }
}
function saveCached(b: Brief) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(b)) } catch { /* private mode */ }
}

export default function NomoBrief() {
  const [brief, setBrief] = useState<Brief | null>(loadCached)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBrief = useCallback(async (force = false) => {
    if (!force && brief) return
    setLoading(true)
    setError(null)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      const res = await fetch('/api/nomo/brief', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.status === 403) { setError('Nomo is disabled in Settings.'); setBrief(null); return }
      if (!res.ok) throw new Error(`brief failed (${res.status})`)
      const json = await res.json() as Brief
      setBrief(json)
      saveCached(json)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [brief])

  useEffect(() => { void fetchBrief() }, [fetchBrief])

  function openInNomo(prompt: string) {
    window.dispatchEvent(new CustomEvent('nomo:open', { detail: { prompt } }))
  }

  if (!brief && !loading && !error) return null  // first paint, hide
  if (error && !brief) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 mb-6 shadow-sm flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">Nomo brief unavailable: {error}</span>
        <Button variant="ghost" size="sm" onClick={() => void fetchBrief(true)} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="relative rounded-lg border border-primary/20 bg-gradient-to-br from-amber-50 via-card to-card p-5 mb-6 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-primary mb-0.5">Nomo brief</p>
            <h2 className="text-base font-semibold leading-tight">
              {loading && !brief ? 'Composing…' : brief?.headline ?? '—'}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => void fetchBrief(true)} disabled={loading} className="h-7 px-2 gap-1">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {brief && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {brief.stats.map((s, i) => (
              <div key={i} className="bg-card/80 backdrop-blur-sm rounded-md border border-border px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="text-base font-mono font-semibold text-foreground tabular-nums">{s.value}</p>
                {s.hint && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{s.hint}</p>}
              </div>
            ))}
          </div>

          {brief.actions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Suggested actions</p>
              {brief.actions.map((a, i) => (
                <button
                  key={i}
                  onClick={() => openInNomo(a.prompt)}
                  className={`w-full flex items-center gap-3 text-left rounded-md border px-3 py-2 transition-colors group ${
                    a.severity === 'warning'
                      ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-100/60 text-amber-900'
                      : a.severity === 'success'
                        ? 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/60 text-emerald-900'
                        : 'border-border bg-card/60 hover:bg-card text-foreground'
                  }`}
                >
                  <Send className="h-3.5 w-3.5 flex-shrink-0 opacity-70 group-hover:opacity-100" />
                  <span className="text-sm flex-1">{a.text}</span>
                  <ChevronRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}

          {brief.actions.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No urgent actions right now. Quiet morning — keep it that way.</p>
          )}

          {brief.model && (
            <p className="text-[10px] font-mono text-muted-foreground/50 mt-3">
              {brief.model} · refreshed {new Date(brief.generated_at).toLocaleTimeString()}
            </p>
          )}
        </>
      )}
    </div>
  )
}
