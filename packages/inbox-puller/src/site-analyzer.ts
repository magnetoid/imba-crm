// Site Analyzer endpoints (Phase 12.7 / closes the Phase 2 deferred work).
//
//   POST /api/site-analyzer/fetch   — body { url } → returns { html, text,
//                                       title, description, status, content_type }
//                                     Server-side fetch — no CORS issues
//                                     for the SPA, no AI hallucination of
//                                     "what the site probably looks like".
//
// Auth: JWT-gated, same pattern as /api/inbox/* and /api/worker/*.

import type { Hono } from 'hono'

const JWT_SECRET = process.env.JWT_SECRET || ''
const MAX_HTML_BYTES = 2 * 1024 * 1024   // 2 MB cap — most marketing sites fit
const FETCH_TIMEOUT_MS = 15_000

function b64urlDecode(s: string) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

async function verifyAuth(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m || !JWT_SECRET) return null
  const parts = m[1].split('.')
  if (parts.length !== 3) return null
  const crypto = await import('node:crypto')
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (expected !== parts[2]) return null
  try {
    const c = JSON.parse(b64urlDecode(parts[1])) as { sub?: string; exp?: number }
    if (typeof c.exp === 'number' && c.exp * 1000 < Date.now()) return null
    return c.sub ?? null
  } catch { return null }
}

// HTML → readable text. Same shape as the inbox htmlToText.
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<(br|p|div|li|tr|h[1-6])[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x?[0-9a-f]+;/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractMeta(html: string): { title: string | null; description: string | null } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
    ?? html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
  return {
    title: titleMatch ? titleMatch[1].trim().slice(0, 200) : null,
    description: descMatch ? descMatch[1].trim().slice(0, 500) : null,
  }
}

function normalizeUrl(raw: string): string {
  let url = raw.trim()
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  return url
}

export function mountSiteAnalyzer(app: Hono) {
  app.use('/api/site-analyzer/*', async (c, next) => {
    const uid = await verifyAuth(c.req.header('authorization'))
    if (!uid) return c.json({ error: 'unauthorized' }, 401)
    await next()
  })

  app.post('/api/site-analyzer/fetch', async c => {
    const body = await c.req.json().catch(() => ({})) as { url?: string }
    const rawUrl = body.url?.trim()
    if (!rawUrl) return c.json({ error: 'url required' }, 400)
    let url: URL
    try { url = new URL(normalizeUrl(rawUrl)) }
    catch { return c.json({ error: 'invalid url' }, 400) }

    // Block private / loopback / link-local addresses to prevent SSRF.
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|localhost|::1)/i.test(url.hostname)) {
      return c.json({ error: 'private addresses not allowed' }, 400)
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      const res = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; imba-crm-site-analyzer/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      })
      clearTimeout(timer)
      const contentType = res.headers.get('content-type') ?? 'unknown'
      if (!contentType.includes('html')) {
        return c.json({ error: 'not html', status: res.status, content_type: contentType }, 415)
      }
      const reader = res.body?.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          if (total > MAX_HTML_BYTES) { reader.cancel(); break }
          chunks.push(value)
        }
      }
      const html = Buffer.concat(chunks).toString('utf-8')
      const meta = extractMeta(html)
      const text = stripHtml(html).slice(0, 50_000)   // cap the text we return
      return c.json({
        url: url.toString(),
        status: res.status,
        content_type: contentType,
        title: meta.title,
        description: meta.description,
        html_bytes: total,
        html: html.slice(0, MAX_HTML_BYTES),
        text,
      })
    } catch (err) {
      const msg = (err as Error).message
      return c.json({ error: msg.includes('abort') ? 'fetch timed out' : msg }, 502)
    }
  })
}
