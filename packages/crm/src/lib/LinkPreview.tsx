// Small card that fetches OG meta for a URL and renders a Slack/Twitter
// style preview. Used in Inbox composer, Nomo messages, and lead-detail
// notes wherever a single URL appears.
//
// The fetch is JWT-gated server-side — no browser-side CORS issues and
// no operator IP exposure to the target page.

import { useEffect, useState } from 'react'
import { supabase } from '@imba/shared/supabase'
import { Loader2, ExternalLink } from 'lucide-react'

interface OGMeta {
  url: string
  title: string | null
  description: string | null
  image: string | null
  site_name: string | null
}

const cache: Map<string, OGMeta | { error: string }> = new Map()

export function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<OGMeta | null>(() => {
    const c = cache.get(url)
    return c && 'url' in c ? c : null
  })
  const [error, setError] = useState<string | null>(() => {
    const c = cache.get(url)
    return c && 'error' in c ? c.error : null
  })
  const [loading, setLoading] = useState(!cache.has(url))

  useEffect(() => {
    if (cache.has(url)) return
    let stopped = false
    void (async () => {
      try {
        const { data: session } = await supabase.auth.getSession()
        const token = session.session?.access_token
        const res = await fetch(`/api/og/fetch?url=${encodeURIComponent(url)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (stopped) return
        if (!res.ok) {
          cache.set(url, { error: `HTTP ${res.status}` })
          setError(`HTTP ${res.status}`); setLoading(false)
          return
        }
        const json = await res.json() as OGMeta
        cache.set(url, json)
        setData(json); setLoading(false)
      } catch (err) {
        if (stopped) return
        const msg = (err as Error).message
        cache.set(url, { error: msg })
        setError(msg); setLoading(false)
      }
    })()
    return () => { stopped = true }
  }, [url])

  if (loading) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block border border-border rounded-md p-3 bg-card text-xs text-muted-foreground hover:bg-muted/40 transition-colors">
        <Loader2 className="h-3 w-3 inline animate-spin mr-1.5" />
        Loading preview…
      </a>
    )
  }
  if (error || !data?.title) {
    // Degrade gracefully — just show the bare link.
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
        {url}<ExternalLink className="h-3 w-3" />
      </a>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block border border-border rounded-md bg-card hover:border-primary/40 transition-colors overflow-hidden max-w-md"
    >
      {data.image && (
        <img
          src={data.image}
          alt=""
          loading="lazy"
          className="w-full h-32 object-cover bg-muted"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div className="p-3 space-y-1">
        {data.site_name && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-mono">{data.site_name}</p>
        )}
        <p className="text-sm font-medium leading-snug line-clamp-2">{data.title}</p>
        {data.description && (
          <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{data.description}</p>
        )}
      </div>
    </a>
  )
}
