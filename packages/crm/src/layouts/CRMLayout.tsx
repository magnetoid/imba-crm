import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, type NavigateFunction } from 'react-router-dom'
import { LogOut, Loader2, Search, Sparkles } from 'lucide-react'
import { supabase } from '@imba/shared/supabase'
import { useSession, hasRole } from '@imba/shared/auth'
import { Separator } from '@imba/shared/ui/separator'
import { Kbd } from '@imba/shared/ui/kbd'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandShortcut,
} from '@imba/shared/ui/command'
import { GROUPS, modulesByGroup, primaryPath, MODULES } from '@/modules/registry'
import type { CRMModule } from '@/modules/types'
import { useHotLeadAlerts } from '@/lib/useHotLeadAlerts'
import NomoPanel from '@/modules/nomo/NomoPanel'

function NavItem({ m }: { m: CRMModule }) {
  const Icon = m.icon
  return (
    <NavLink
      to={primaryPath(m)}
      end={m.id === 'pipeline'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        }`
      }
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {m.label}
    </NavLink>
  )
}

export default function CRMLayout() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [nomoOpen, setNomoOpen] = useState(false)
  const [nomoLead, setNomoLead] = useState<{ id: string; label: string } | null>(null)
  const [nomoSeedPrompt, setNomoSeedPrompt] = useState<string | null>(null)

  useEffect(() => {
    document.body.classList.add('admin-shell')
    return () => { document.body.classList.remove('admin-shell') }
  }, [])

  // Hot-lead push alerts (speed-to-lead).
  useHotLeadAlerts()

  // ⌘K command palette, ⌘J Nomo panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setNomoOpen(o => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // 'nomo:open' custom event lets pages open the panel pre-pinned to
  // a lead and/or pre-filled with a starter prompt (e.g. the daily
  // brief's "Suggested actions").
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ lead_id?: string; lead_label?: string; prompt?: string }>).detail
      if (detail?.lead_id) setNomoLead({ id: detail.lead_id, label: detail.lead_label ?? '' })
      if (detail?.prompt)  setNomoSeedPrompt(detail.prompt)
      setNomoOpen(true)
    }
    window.addEventListener('nomo:open', onOpen)
    return () => window.removeEventListener('nomo:open', onOpen)
  }, [])

  return (
    <div className="min-h-screen bg-muted/40 flex">
      <aside className="w-60 bg-card border-r border-border flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-border space-y-3">
          <span className="text-xl font-semibold text-foreground block tracking-tight">
            imba<span className="italic text-primary">.</span>crm
          </span>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md border border-border bg-muted/60 hover:bg-muted transition-colors text-xs text-muted-foreground"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Quick jump…</span>
            <Kbd>⌘K</Kbd>
          </button>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
          {GROUPS.map((group, groupIdx) => {
            const visible = modulesByGroup(group.id).filter(m =>
              !m.roles || hasRole(session, ...m.roles)
            )
            if (visible.length === 0) return null
            return (
              <div key={group.id}>
                {groupIdx > 0 && <Separator className="my-2" />}
                <p className="px-3 py-1 text-[0.6rem] font-mono tracking-widest uppercase text-muted-foreground/70 mb-1">
                  {group.label}
                </p>
                {visible.map(m => <NavItem key={m.id} m={m} />)}
              </div>
            )
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Suspense fallback={
          <div className="min-h-full flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }>
          <Outlet />
        </Suspense>
      </main>

      <GlobalCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        navigate={navigate}
        session={session}
        onOpenNomo={() => { setPaletteOpen(false); setNomoOpen(true) }}
      />

      {/* Nomo: side panel + floating launcher */}
      <NomoPanel
        open={nomoOpen}
        onClose={() => { setNomoOpen(false); setNomoLead(null); setNomoSeedPrompt(null) }}
        leadId={nomoLead?.id}
        leadLabel={nomoLead?.label}
        seedPrompt={nomoSeedPrompt}
        onSeedConsumed={() => setNomoSeedPrompt(null)}
      />
      {!nomoOpen && (
        <button
          onClick={() => setNomoOpen(true)}
          className="fixed bottom-5 right-5 z-30 h-12 px-4 rounded-full shadow-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-2"
          title="Ask Nomo (⌘J)"
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">Ask Nomo</span>
          <Kbd className="bg-black/20 text-primary-foreground border-white/20">⌘J</Kbd>
        </button>
      )}
    </div>
  )
}

// ── Global command palette ───────────────────────────────────────────
// One Cmd+K input that searches: modules + leads (by name/email/company)
// + inbox threads (by subject/last sender) + recent agent jobs + a
// handful of one-tap actions. Each search type fires its own query at
// most every 250ms; results render in grouped sections.

interface PaletteLead {
  id: string
  name: string
  email: string | null
  company: string | null
  stage: string | null
}
interface PaletteThread {
  thread_key: string
  subject: string
  last_message_at: string
  last_from_email: string | null
  unread_count: number
}
interface PaletteJob {
  id: string
  agent_kind: string
  status: string
  created_at: string
}

function GlobalCommandPalette({
  open, onOpenChange, navigate, session, onOpenNomo,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  navigate: NavigateFunction
  session: ReturnType<typeof useSession>
  onOpenNomo: () => void
}) {
  const [query, setQuery] = useState('')
  const [leads, setLeads] = useState<PaletteLead[]>([])
  const [threads, setThreads] = useState<PaletteThread[]>([])
  const [jobs, setJobs] = useState<PaletteJob[]>([])
  const [loading, setLoading] = useState(false)

  // Debounced search. Empty query → no rows (only modules + actions show).
  useEffect(() => {
    if (!open) { setQuery(''); setLeads([]); setThreads([]); setJobs([]); return }
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (!q || !open) { setLeads([]); setThreads([]); setJobs([]); return }
    setLoading(true)
    const t = setTimeout(async () => {
      const like = `%${q}%`
      const [leadsRes, threadsRes, jobsRes] = await Promise.all([
        supabase.from('crm_leads')
          .select('id, name, email, company, stage')
          .or(`name.ilike.${like},email.ilike.${like},company.ilike.${like}`)
          .order('updated_at', { ascending: false }).limit(6),
        supabase.from('crm_inbox_threads')
          .select('thread_key, subject, last_message_at, last_from_email, unread_count')
          .or(`subject.ilike.${like},last_from_email.ilike.${like}`)
          .order('last_message_at', { ascending: false }).limit(5),
        supabase.from('crm_agent_jobs')
          .select('id, agent_kind, status, created_at')
          .or(`agent_kind.ilike.${like},triggered_by.ilike.${like}`)
          .order('created_at', { ascending: false }).limit(3),
      ])
      setLeads((leadsRes.data as PaletteLead[] | null) ?? [])
      setThreads((threadsRes.data as PaletteThread[] | null) ?? [])
      setJobs((jobsRes.data as PaletteJob[] | null) ?? [])
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  function jump(path: string) {
    navigate(path)
    onOpenChange(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Jump anywhere — type a lead, subject, module, or action…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{loading ? 'Searching…' : 'No matches.'}</CommandEmpty>

        {/* ── Quick actions ─────────────────────────────────────────── */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => jump('/admin/crm/inbox#__new')}>
            <Sparkles className="h-3.5 w-3.5" />
            Compose new message
            <CommandShortcut>c</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => jump('/admin/crm/lead-finder')}>
            <Search className="h-3.5 w-3.5" />
            Find new prospects
          </CommandItem>
          <CommandItem onSelect={onOpenNomo}>
            <Sparkles className="h-3.5 w-3.5" />
            Ask Nomo
            <CommandShortcut>⌘J</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => jump('/admin/crm/settings')}>
            <Sparkles className="h-3.5 w-3.5" />
            Open Settings
          </CommandItem>
        </CommandGroup>

        {/* ── Search results ───────────────────────────────────────── */}
        {leads.length > 0 && (
          <CommandGroup heading={`Leads (${leads.length})`}>
            {leads.map(l => (
              <CommandItem key={l.id} onSelect={() => jump(`/admin/crm/${l.id}`)}>
                <span className="font-medium">{l.name}</span>
                {l.company && <span className="text-muted-foreground">· {l.company}</span>}
                {l.email && <span className="text-[10px] text-muted-foreground/70">{l.email}</span>}
                <CommandShortcut>{l.stage ?? 'lead'}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {threads.length > 0 && (
          <CommandGroup heading={`Inbox (${threads.length})`}>
            {threads.map(t => (
              <CommandItem
                key={t.thread_key}
                onSelect={() => jump(`/admin/crm/inbox#${encodeURIComponent(t.thread_key)}`)}
              >
                <span className="font-medium truncate">{t.subject || '(no subject)'}</span>
                {t.last_from_email && <span className="text-muted-foreground truncate">· {t.last_from_email}</span>}
                {t.unread_count > 0 && <CommandShortcut>{t.unread_count} new</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {jobs.length > 0 && (
          <CommandGroup heading={`Agent runs (${jobs.length})`}>
            {jobs.map(j => (
              <CommandItem key={j.id} onSelect={() => jump(`/admin/crm/agents/${j.id}`)}>
                <span className="font-medium">{j.agent_kind}</span>
                <span className="text-muted-foreground">{j.status}</span>
                <CommandShortcut>{j.id.slice(0, 8)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* ── Module navigation (existing behavior) ────────────────── */}
        {GROUPS.map(group => {
          const visible = MODULES.filter(m =>
            m.group === group.id && !m.hidden && (!m.roles || hasRole(session, ...m.roles))
          ).sort((a, b) => a.order - b.order)
          if (visible.length === 0) return null
          return (
            <CommandGroup key={group.id} heading={group.label}>
              {visible.map(m => {
                const Icon = m.icon
                return (
                  <CommandItem key={m.id} onSelect={() => jump(primaryPath(m))}>
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                    <CommandShortcut>{group.label}</CommandShortcut>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}
