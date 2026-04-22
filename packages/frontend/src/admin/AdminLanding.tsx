import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '@imba/shared/supabase'
import {
  LayoutDashboard, ArrowRight, FileText, Image, MessageSquare, Film, ExternalLink,
} from 'lucide-react'

export default function AdminLanding() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState({ portfolio: 0, blog: 0, quotes: 0 })

  useEffect(() => {
    Promise.all([
      supabase.from('portfolio_items').select('*', { count: 'exact', head: true }),
      supabase.from('blog_posts').select('*', { count: 'exact', head: true }),
      supabase.from('quote_requests').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    ]).then(([p, b, q]) =>
      setCounts({
        portfolio: p.count || 0,
        blog: b.count || 0,
        quotes: q.count || 0,
      })
    )
  }, [])

  return (
    <div className="p-8 min-h-full">
      <div className="mb-10">
        <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">Imba Production</p>
        <h1 className="text-3xl font-semibold text-foreground">CMS</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage the public website content.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="group relative overflow-hidden text-left rounded-lg border border-border bg-card hover:border-primary/40 transition-all duration-300 p-8"
        >
          <div className="relative">
            <div className="w-14 h-14 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
              <LayoutDashboard className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">Content Management</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Portfolio, blog, hero videos, media, translations, SEO.
            </p>

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

        <a
          href="https://crm.imbaproduction.com/"
          target="_blank"
          rel="noreferrer"
          className="group relative overflow-hidden text-left rounded-lg border border-border bg-card hover:border-amber-500/40 transition-all duration-300 p-8"
        >
          <div className="absolute top-4 right-4">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60" />
          </div>
          <div className="relative">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center mb-6"
              style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.2)' }}>
              <span className="text-xl font-semibold" style={{ color: '#C9A96E' }}>.crm</span>
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">AI CRM</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Lead pipeline, AI outreach, proposals, invoices. Served from the CRM subdomain.
            </p>
            <div className="flex items-center gap-2 font-mono text-xs tracking-widest uppercase"
              style={{ color: '#C9A96E' }}>
              <span>Open CRM</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </a>
      </div>
    </div>
  )
}
