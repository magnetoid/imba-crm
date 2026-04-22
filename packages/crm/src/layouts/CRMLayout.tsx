import { Suspense, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, Loader2 } from 'lucide-react'
import { supabase } from '@imba/shared/supabase'
import { useSession, hasRole } from '@imba/shared/auth'
import { Separator } from '@imba/shared/ui/separator'
import { GROUPS, modulesByGroup, primaryPath } from '@/modules/registry'
import type { CRMModule } from '@/modules/types'

function NavItem({ m }: { m: CRMModule }) {
  const Icon = m.icon
  return (
    <NavLink
      to={primaryPath(m)}
      end={m.id === 'pipeline'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
          isActive
            ? 'bg-amber-500/10 text-amber-500 font-medium'
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

  useEffect(() => {
    document.body.classList.add('admin-shell')
    return () => { document.body.classList.remove('admin-shell') }
  }, [])

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-60 bg-card border-r border-border flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-border">
          <span className="text-xl font-semibold text-foreground">
            imba<span className="italic" style={{ color: '#C9A96E' }}>.</span>crm
          </span>
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
                <p className="px-3 py-1 text-[0.6rem] font-mono tracking-widest uppercase text-amber-500/40 mb-1">
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
    </div>
  )
}
