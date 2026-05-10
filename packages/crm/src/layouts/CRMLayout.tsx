import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
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

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Jump to module, lead, or run an action…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
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
                    <CommandItem
                      key={m.id}
                      onSelect={() => {
                        navigate(primaryPath(m))
                        setPaletteOpen(false)
                      }}
                    >
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
