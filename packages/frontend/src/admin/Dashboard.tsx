import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Image, FileText, MessageSquare, Film } from 'lucide-react'
import { NavLink } from 'react-router-dom'

interface Counts {
  portfolio: number
  blog: number
  quotes: number
  heroVideos: number
}

const STATS = [
  {
    label: 'Portfolio Items',
    key: 'portfolio' as const,
    icon: Image,
    to: '/admin/portfolio',
    description: 'Published work items',
  },
  {
    label: 'Blog Posts',
    key: 'blog' as const,
    icon: FileText,
    to: '/admin/blog',
    description: 'Written articles',
  },
  {
    label: 'Quote Requests',
    key: 'quotes' as const,
    icon: MessageSquare,
    to: '/admin/quotes',
    description: 'Client inquiries',
  },
  {
    label: 'Hero Videos',
    key: 'heroVideos' as const,
    icon: Film,
    to: '/admin/hero-videos',
    description: 'Homepage slider',
  },
]

export default function Dashboard() {
  const [counts, setCounts] = useState<Counts>({ portfolio: 0, blog: 0, quotes: 0, heroVideos: 0 })

  useEffect(() => {
    Promise.all([
      supabase.from('portfolio_items').select('*', { count: 'exact', head: true }),
      supabase.from('blog_posts').select('*', { count: 'exact', head: true }),
      supabase.from('quote_requests').select('*', { count: 'exact', head: true }),
      supabase.from('hero_videos').select('*', { count: 'exact', head: true }),
    ]).then(([p, b, q, h]) =>
      setCounts({
        portfolio: p.count || 0,
        blog: b.count || 0,
        quotes: q.count || 0,
        heroVideos: h.count || 0,
      })
    )
  }, [])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Welcome back — here's an overview of your content.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STATS.map(({ label, key, icon: Icon, to, description }) => (
          <NavLink key={key} to={to}>
            <Card className="hover:border-primary/30 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{counts[key]}</div>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
              </CardContent>
            </Card>
          </NavLink>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {STATS.map(({ label, icon: Icon, to }) => (
              <NavLink
                key={to}
                to={to}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Icon className="h-4 w-4" />
                Manage {label}
              </NavLink>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {STATS.map(({ label, key, icon: Icon }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </div>
                  <span className="text-sm font-medium text-foreground">{counts[key]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
