// First-run onboarding card. Renders on the dashboard while any of the
// must-have setup steps are still missing. Auto-disappears once every
// step is done (or after the operator dismisses it).
//
// Checked-against signals:
//   1. AI provider configured (any of anthropic / openai / openrouter
//      in crm_provider_credentials)
//   2. SMTP credentials set (provider='smtp' AND smtp_host non-empty)
//   3. IMAP credentials set (provider='imap' AND imap_host non-empty)
//   4. Company profile filled (crm_runtime_settings.company_name)
//   5. ICP rules set (crm_runtime_settings.icp_rules has industries)
//   6. At least one lead exists (passed in as a prop — already in scope)
//
// Each step links straight to the relevant Settings tab (or Lead Finder).
// The "Skip for now" link sets a localStorage flag so subsequent visits
// stay clean.

import { useEffect, useState } from 'react'
import { supabase } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { ChevronRight, CheckCircle2, Circle, X, Rocket } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const DISMISS_KEY = 'onboarding_dismissed_v1'

interface StepState {
  ai: boolean
  smtp: boolean
  imap: boolean
  company: boolean
  icp: boolean
  leads: boolean
}

export default function OnboardingCard({ leadsCount }: { leadsCount: number }) {
  const [state, setState] = useState<StepState | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  const navigate = useNavigate()

  useEffect(() => {
    if (dismissed) return
    void (async () => {
      const [{ data: providers }, { data: runtime }] = await Promise.all([
        supabase.rpc('list_provider_credentials'),
        supabase.from('crm_runtime_settings').select('smtp_host, imap_host, company_name, icp_rules').eq('id', 1).maybeSingle(),
      ])
      const provRows = (providers as Array<{ provider: string; has_key: boolean }> | null) ?? []
      const has = (k: string) => !!provRows.find(p => p.provider === k && p.has_key)
      const r = (runtime as { smtp_host?: string; imap_host?: string; company_name?: string; icp_rules?: { industries?: string[] } } | null) ?? {}
      setState({
        ai:      has('anthropic') || has('openai') || has('openrouter'),
        smtp:    has('smtp') && !!r.smtp_host,
        imap:    has('imap') && !!r.imap_host,
        company: !!r.company_name?.trim(),
        icp:     (r.icp_rules?.industries?.length ?? 0) > 0,
        leads:   leadsCount > 0,
      })
    })()
  }, [leadsCount, dismissed])

  if (dismissed || !state) return null
  const total = Object.keys(state).length
  const done  = Object.values(state).filter(Boolean).length
  if (done === total) return null

  const steps: Array<{ key: keyof StepState; label: string; cta: string; href: string }> = [
    { key: 'ai',      label: 'Connect an AI provider',         cta: 'Open AI providers',  href: '/admin/crm/settings#ai' },
    { key: 'smtp',    label: 'Configure outbound SMTP',         cta: 'Open Outbound mail', href: '/admin/crm/settings#smtp' },
    { key: 'imap',    label: 'Configure inbound IMAP',          cta: 'Open IMAP inbox',    href: '/admin/crm/settings#imap' },
    { key: 'company', label: 'Tell the AI about your company', cta: 'Open Company',       href: '/admin/crm/settings#company' },
    { key: 'icp',     label: 'Define your ICP rules',           cta: 'Open ICP rules',     href: '/admin/crm/settings#icp' },
    { key: 'leads',   label: 'Find your first prospects',       cta: 'Open Lead Finder',   href: '/admin/crm/lead-finder' },
  ]

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* */ }
    setDismissed(true)
  }

  return (
    <div className="mb-6 bg-gradient-to-br from-primary/10 to-card border border-primary/30 rounded-lg p-5 shadow-sm relative">
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        title="Dismiss — you can reach all of these from Settings anytime"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 mb-1">
        <Rocket className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Quick setup</h2>
        <span className="ml-2 text-xs font-mono text-muted-foreground">{done} / {total} done</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Six steps to a working pipeline. Each is one click — most are 1 minute.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {steps.map(s => {
          const ok = state[s.key]
          return (
            <button
              key={s.key}
              onClick={() => navigate(s.href)}
              disabled={ok}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors text-sm ${
                ok
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900 cursor-default'
                  : 'bg-card border border-border hover:border-primary/40 hover:bg-muted/40'
              }`}
            >
              {ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
              )}
              <span className={`flex-1 ${ok ? 'line-through opacity-70' : ''}`}>{s.label}</span>
              {!ok && (
                <span className="text-[10px] text-primary inline-flex items-center gap-0.5">
                  {s.cta} <ChevronRight className="h-3 w-3" />
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px]">
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground">
          Skip for now — I'll come back to this
        </button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/admin/crm/settings')} className="h-7 gap-1">
          Open Settings →
        </Button>
      </div>
    </div>
  )
}
