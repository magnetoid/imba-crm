import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LayoutDashboard, Users, ArrowRight, FileText, Image, MessageSquare, Film, TrendingUp,
} from 'lucide-react'

export default function AdminLanding() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState({ portfolio: 0, blog: 0, quotes: 0, leads: 0 })

  useEffect(() => {
    Promise.all([
      supabase.from('portfolio_items').select('*', { count: 'exact', head: true }),
      supabase.from('blog_posts').select('*', { count: 'exact', head: true }),
      supabase.from('quote_requests').select('*', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('crm_leads').select('*', { count: 'exact', head: true }),
    ]).then(([p, b, q, l]) =>
      setCounts({
        portfolio: p.count || 0,
        blog: b.count || 0,
        quotes: q.count || 0,
        leads: l.count || 0,
      })
    )
  }, [])

  return (
    <div className="p-8 min-h-full">
      <div className="mb-10">
        <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">Imba Production</p>
        <h1 className="text-3xl font-semibold text-foreground">Control Centre</h1>
        <p className="text-muted-foreground text-sm mt-1">Choose a module to get started.</p>
      </div>

      {/* Two big mode tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {/* CMS */}
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="group relative overflow-hidden text-left rounded-lg border border-border bg-card hover:border-primary/40 transition-all duration-300 p-8"
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ background: 'radial-gradient(ellipse 80% 60% at 20% 80%, rgba(232,69,42,0.06) 0%, transparent 70%)' }} />

          <div className="relative">
            <div className="w-14 h-14 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
              <LayoutDashboard className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">Content Management</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Manage portfolio, blog posts, hero videos, media library, translations, and SEO settings.
            </p>

            {/* Mini stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="flex items-center gap-2">
                <Image className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{counts.portfolio} portfolio items</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{counts.blog} blog posts</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{counts.quotes} new quotes</span>
              </div>
              <div className="flex items-center gap-2">
                <Film className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Hero videos</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-primary font-mono text-xs tracking-widest uppercase">
              <span>Open CMS</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </button>

        {/* AI CRM */}
        <button
          onClick={() => navigate('/admin/crm')}
          className="group relative overflow-hidden text-left rounded-lg border border-border bg-card hover:border-amber-500/40 transition-all duration-300 p-8"
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ background: 'radial-gradient(ellipse 80% 60% at 80% 20%, rgba(201,169,110,0.07) 0%, transparent 70%)' }} />

          {/* AI badge */}
          <div className="absolute top-4 right-4">
            <span className="text-[0.58rem] font-mono tracking-widest uppercase px-2 py-1 border rounded-sm"
              style={{ background: 'rgba(201,169,110,0.08)', color: '#C9A96E', borderColor: 'rgba(201,169,110,0.2)' }}>
              AI-Powered
            </span>
          </div>

          <div className="relative">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center mb-6"
              style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.2)' }}>
              <Users className="h-7 w-7" style={{ color: '#C9A96E' }} />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">AI CRM</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Intelligent lead pipeline, AI scoring, follow-up automation, and email templates to convert clients faster.
            </p>

            {/* Mini stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{counts.leads} leads tracked</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Pipeline view</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.7rem]" style={{ color: '#C9A96E' }}>✦</span>
                <span className="text-xs text-muted-foreground">AI lead scoring</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.7rem]" style={{ color: '#C9A96E' }}>✦</span>
                <span className="text-xs text-muted-foreground">Email templates</span>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs tracking-widest uppercase"
              style={{ color: '#C9A96E' }}>
              <span>Open CRM</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </button>
      </div>

      {/* Quick shortcuts */}
      <div className="border border-border rounded-lg p-5">
        <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-4">Quick access</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Portfolio', to: '/admin/portfolio', icon: Image },
            { label: 'Blog', to: '/admin/blog', icon: FileText },
            { label: 'Quote Requests', to: '/admin/quotes', icon: MessageSquare },
            { label: 'Hero Videos', to: '/admin/hero-videos', icon: Film },
          ].map(({ label, to, icon: Icon }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all text-left"
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
