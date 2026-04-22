import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Label } from '@imba/shared/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@imba/shared/ui/card'
import { Separator } from '@imba/shared/ui/separator'
import {
  LayoutDashboard, Film, Image, FileText, MessageSquare, LogOut, Loader2,
  FolderOpen, Tag, Upload, Globe, Search, Star,
} from 'lucide-react'

const NAV_CMS_CONTENT = [
  { to: '/admin/dashboard',       label: 'Dashboard',       icon: LayoutDashboard },
  { to: '/admin/hero-videos',     label: 'Hero Videos',     icon: Film },
  { to: '/admin/portfolio',       label: 'Portfolio',       icon: Image },
  { to: '/admin/media',           label: 'Media Library',   icon: FolderOpen },
  { to: '/admin/blog',            label: 'Blog',            icon: FileText },
  { to: '/admin/blog/categories', label: 'Categories',      icon: Tag },
  { to: '/admin/testimonials',    label: 'Testimonials',    icon: Star },
  { to: '/admin/import',          label: 'Import / Export', icon: Upload },
  { to: '/admin/translations',    label: 'Translations',    icon: Globe },
  { to: '/admin/quotes',          label: 'Quote Requests',  icon: MessageSquare },
  { to: '/admin/seo',             label: 'SEO',             icon: Search },
]

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: React.ElementType }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        }`
      }
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </NavLink>
  )
}

export default function AdminLayout() {
  const location = useLocation()
  const [session, setSession] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    document.body.classList.add('admin-shell')

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))

    return () => {
      document.body.classList.remove('admin-shell')
      subscription.unsubscribe()
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setSigningIn(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoginError(error.message)
    setSigningIn(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  if (!session) return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 pb-4">
          <div className="text-2xl font-semibold text-foreground">
            imba<span className="text-primary italic">.</span>admin
          </div>
          <CardTitle className="text-base text-muted-foreground font-normal">
            Sign in to the CMS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="admin@imba.com"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {loginError && <p className="text-destructive text-sm">{loginError}</p>}
            <Button type="submit" disabled={signingIn} className="w-full">
              {signingIn ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in…</> : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )

  const isLanding = location.pathname === '/admin'

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-60 bg-card border-r border-border flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-border">
          <span className="text-xl font-semibold text-foreground">
            imba<span className="text-primary italic">.</span>admin
          </span>
        </div>

        {!isLanding && (
          <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
            <p className="px-3 py-1 text-[0.6rem] font-mono tracking-widest uppercase text-muted-foreground/40 mb-1">Content</p>
            {NAV_CMS_CONTENT.map(item => <NavItem key={item.to} {...item} />)}
            <Separator className="my-2" />
          </nav>
        )}

        {isLanding && <div className="flex-1" />}

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
        <Outlet />
      </main>
    </div>
  )
}
