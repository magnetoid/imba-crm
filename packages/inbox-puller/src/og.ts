// Open Graph endpoints. Two surfaces:
//
//   GET /api/og/fetch?url=https://...
//     Server-side fetch + parse <meta og:*> + <meta name="twitter:*">.
//     Returns { url, title, description, image, site_name, author }.
//     Used by the SPA to render link previews in inbox composer, Nomo
//     replies, and lead notes without exposing the operator's IP / cookies.
//
//   GET /og/lead/:id
//     Server-renders an HTML document with <meta og:*> + <meta twitter:*>
//     pre-filled from the lead row. When the operator shares
//     /admin/crm/<id> in Slack/email, this URL gets crawled and the
//     preview card shows lead name + company + stage + a small auto-
//     generated SVG card as the og:image.
//
// Auth:
//   /api/og/fetch  — JWT-gated (operator only; uses callerJwtVerify).
//   /og/lead/:id   — PUBLIC (it's meant to be crawled by Slack/Twitter/
//                    Discord/etc bots). Only lead.name + lead.company
//                    + lead.stage are exposed; no PII (email/phone).

import type { Hono } from 'hono'
import { supabase } from './supabase.js'

const JWT_SECRET = process.env.JWT_SECRET || ''
const FETCH_TIMEOUT_MS = 10_000
const MAX_HTML_BYTES = 2 * 1024 * 1024
const ALLOWED_LEAD_FIELDS = ['id', 'name', 'company', 'stage'] as const

function b64urlDecode(s: string) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}
async function verifyJwt(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader || !JWT_SECRET) return false
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return false
  const parts = m[1].split('.')
  if (parts.length !== 3) return false
  const crypto = await import('node:crypto')
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (expected !== parts[2]) return false
  try {
    const c = JSON.parse(b64urlDecode(parts[1])) as { exp?: number }
    if (typeof c.exp === 'number' && c.exp * 1000 < Date.now()) return false
    return true
  } catch { return false }
}

function pickMeta(html: string, names: string[]): string | null {
  for (const n of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']+)["']`, 'i'
    )
    const m1 = html.match(re)
    if (m1) return m1[1].trim()
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${n}["']`, 'i'
    )
    const m2 = html.match(re2)
    if (m2) return m2[1].trim()
  }
  return null
}

function normalizeUrl(raw: string): URL | null {
  let s = raw.trim()
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  try { return new URL(s) } catch { return null }
}

// Block private addresses (SSRF guard — same pattern as site-analyzer).
function isPrivateHost(host: string): boolean {
  return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|localhost$|::1$)/i.test(host)
}

export function mountOG(app: Hono) {
  // ── /api/og/fetch — operator-only, returns parsed OG JSON ───────
  app.get('/api/og/fetch', async c => {
    const ok = await verifyJwt(c.req.header('authorization'))
    if (!ok) return c.json({ error: 'unauthorized' }, 401)
    const raw = c.req.query('url')
    if (!raw) return c.json({ error: 'url required' }, 400)
    const url = normalizeUrl(raw)
    if (!url) return c.json({ error: 'invalid url' }, 400)
    if (isPrivateHost(url.hostname)) return c.json({ error: 'private addresses not allowed' }, 400)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url.toString(), {
        redirect: 'follow', signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; imba-crm-og/1.0; +https://crm.imbaproduction.com/og)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      })
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('html')) {
        return c.json({ url: url.toString(), title: null, description: null, image: null, site_name: null, error: `not html (${ct})` }, 200)
      }
      // Read at most MAX_HTML_BYTES — OG tags live in <head> so 64 KB
      // is usually more than enough.
      const reader = res.body?.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          chunks.push(value)
          if (total > MAX_HTML_BYTES) { reader.cancel(); break }
          // Optimistically stop once we've seen </head> in the early bytes.
          if (total > 64 * 1024) {
            const peek = Buffer.concat(chunks).toString('utf-8', 0, Math.min(total, 200_000))
            if (peek.includes('</head>')) { reader.cancel(); break }
          }
        }
      }
      const html = Buffer.concat(chunks).toString('utf-8')
      const headOnly = html.split(/<\/head>/i)[0] ?? html

      const titleRaw   = pickMeta(headOnly, ['og:title', 'twitter:title'])
        ?? headOnly.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null
      const description = pickMeta(headOnly, ['og:description', 'twitter:description', 'description'])
      const image      = pickMeta(headOnly, ['og:image', 'twitter:image', 'twitter:image:src'])
      const site_name  = pickMeta(headOnly, ['og:site_name', 'application-name'])
      const author     = pickMeta(headOnly, ['article:author', 'author'])

      // Resolve relative image URLs against the page origin.
      let imageAbs: string | null = null
      if (image) {
        try { imageAbs = new URL(image, url.toString()).toString() }
        catch { imageAbs = image }
      }

      return c.json({
        url: url.toString(),
        title: titleRaw ? titleRaw.slice(0, 240) : null,
        description: description ? description.slice(0, 500) : null,
        image: imageAbs,
        site_name: site_name ? site_name.slice(0, 80) : null,
        author: author ? author.slice(0, 80) : null,
      })
    } catch (err) {
      const msg = (err as Error).message
      return c.json({ error: msg.includes('abort') ? 'fetch timed out' : msg }, 502)
    } finally {
      clearTimeout(timer)
    }
  })

  // ── /og/lead/:id — public, returns HTML with embedded meta + SVG image
  // Crawlers (Slack, Twitter, LinkedIn, Discord) hit this URL and read
  // the meta tags. The HTML body just redirects to the real admin page
  // for the operator who clicks the link.
  app.get('/og/lead/:id', async c => {
    const id = c.req.param('id')
    if (!id || !/^[0-9a-f-]{8,40}$/i.test(id)) {
      return c.text('invalid id', 400)
    }
    const { data } = await supabase
      .from('crm_leads')
      .select(ALLOWED_LEAD_FIELDS.join(','))
      .eq('id', id)
      .maybeSingle()
    const lead = data as { id: string; name: string; company: string | null; stage: string | null } | null
    if (!lead) return c.text('not found', 404)

    const title = `${lead.name}${lead.company ? ' · ' + lead.company : ''}`
    const desc  = `Lead in imba-crm — stage: ${lead.stage ?? 'new'}.`
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const t = escape(title)
    const d = escape(desc)
    const imgUrl = `https://crm.imbaproduction.com/og/lead/${id}/image.svg`
    const redirect = `https://crm.imbaproduction.com/admin/crm/${id}`
    const html = `<!doctype html><html><head>
<meta charset="utf-8" />
<title>${t}</title>
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:type" content="profile" />
<meta property="og:image" content="${imgUrl}" />
<meta property="og:url" content="${redirect}" />
<meta property="og:site_name" content="imba-crm" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${imgUrl}" />
<meta http-equiv="refresh" content="0;url=${redirect}" />
</head><body><p>Redirecting to <a href="${redirect}">${redirect}</a>…</p></body></html>`
    return c.html(html)
  })

  // ── /og/lead/:id/image.svg — generated 1200×630 share card ──────
  app.get('/og/lead/:id/image.svg', async c => {
    const id = c.req.param('id')
    if (!id || !/^[0-9a-f-]{8,40}$/i.test(id)) return c.text('invalid id', 400)
    const { data } = await supabase
      .from('crm_leads')
      .select('id, name, company, stage, fit_score, intent_score')
      .eq('id', id)
      .maybeSingle()
    const lead = data as { name: string; company: string | null; stage: string | null; fit_score: number | null; intent_score: number | null } | null
    if (!lead) return c.text('not found', 404)
    const stageColor: Record<string, string> = {
      new: '#6C7AE0', qualified: '#3CBFAE', proposal: '#C9A96E',
      negotiation: '#E87A2A', won: '#22c55e', lost: '#64748b',
    }
    const stage = lead.stage ?? 'new'
    const stageHex = stageColor[stage] ?? '#6C7AE0'
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const initial = (lead.name?.[0] ?? '?').toUpperCase()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <rect x="0" y="0" width="1200" height="8" fill="${stageHex}"/>
  <text x="80" y="100" font-family="system-ui, sans-serif" font-size="28" fill="#999" font-weight="600" letter-spacing="3">IMBA-CRM</text>
  <circle cx="160" cy="260" r="70" fill="${stageHex}"/>
  <text x="160" y="285" font-family="system-ui" font-size="80" fill="#fff" font-weight="700" text-anchor="middle">${esc(initial)}</text>
  <text x="280" y="240" font-family="system-ui" font-size="60" fill="#fff" font-weight="700">${esc(lead.name.slice(0, 30))}</text>
  ${lead.company ? `<text x="280" y="295" font-family="system-ui" font-size="34" fill="#bbb" font-weight="500">${esc(lead.company.slice(0, 40))}</text>` : ''}
  <rect x="280" y="335" width="${stage.length * 24 + 40}" height="42" rx="21" fill="${stageHex}"/>
  <text x="${280 + 20}" y="365" font-family="system-ui" font-size="22" fill="#fff" font-weight="700" letter-spacing="2">${esc(stage.toUpperCase())}</text>
  <g transform="translate(80, 460)">
    <text font-family="system-ui" font-size="20" fill="#888">Fit score</text>
    <text y="40" font-family="system-ui" font-size="44" fill="#fff" font-weight="700">${lead.fit_score ?? '—'}</text>
  </g>
  <g transform="translate(280, 460)">
    <text font-family="system-ui" font-size="20" fill="#888">Intent</text>
    <text y="40" font-family="system-ui" font-size="44" fill="#fff" font-weight="700">${lead.intent_score ?? '—'}</text>
  </g>
  <text x="80" y="600" font-family="system-ui" font-size="20" fill="#666">crm.imbaproduction.com</text>
</svg>`
    c.header('Content-Type', 'image/svg+xml')
    c.header('Cache-Control', 'public, max-age=300')
    return c.body(svg)
  })
}
