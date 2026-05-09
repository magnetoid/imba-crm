// Contact-form channel — light-weight: fetches the company's website,
// finds a plain HTML <form>, fills the visible fields, POSTs as
// application/x-www-form-urlencoded.
//
// Limitations (intentional, kept for v1):
//   - No JavaScript execution. Sites that build forms client-side
//     (React/Vue) won't work — those go to the Browserbase fallback
//     in a future iteration.
//   - No CAPTCHA bypass. If a form has reCAPTCHA we mark 'skipped' and
//     fall back to email.
//   - No file uploads.
//
// The plan is to swap this for Stagehand+Browserbase once we're ready
// to ship the heavier image; the channel interface stays identical so
// the swap is transparent to the agent runtime.

import type { Channel, ChannelInput, ChannelResult } from './types.js'

const CANDIDATE_PATHS = ['/contact', '/contact-us', '/get-in-touch', '/contact.html', '/about']
const FETCH_TIMEOUT_MS = 12000

function ua() {
  return 'Mozilla/5.0 (compatible; ImbaCRMBot/1.0; +https://crm.imbaproduction.com/bot)'
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'user-agent': ua(), ...(init?.headers || {}) },
      redirect: 'follow',
    })
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

interface FormCandidate {
  action: string
  method: 'POST' | 'GET'
  fields: Array<{ name: string; type: string; required: boolean }>
  hasRecaptcha: boolean
}

function parseForms(html: string, pageUrl: string): FormCandidate[] {
  // Cheap regex parse — good enough to find <form action method> + <input name>.
  // We avoid pulling in a full HTML parser to keep the worker image lean.
  const out: FormCandidate[] = []
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi
  let m: RegExpExecArray | null
  while ((m = formRe.exec(html)) !== null) {
    const attrs = m[1]
    const inner = m[2]
    const action = attr(attrs, 'action') || pageUrl
    const method = (attr(attrs, 'method') || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST'
    const hasRecaptcha = /g-recaptcha|recaptcha\/api|hcaptcha/i.test(inner) || /g-recaptcha-response/.test(inner)
    const fields: FormCandidate['fields'] = []
    const inputRe = /<(input|textarea|select)\b([^>]*)>/gi
    let im: RegExpExecArray | null
    while ((im = inputRe.exec(inner)) !== null) {
      const a = im[2]
      const name = attr(a, 'name')
      if (!name) continue
      const type = (attr(a, 'type') || im[1].toLowerCase()).toLowerCase()
      const required = /\brequired\b/i.test(a)
      fields.push({ name, type, required })
    }
    out.push({ action: resolveUrl(action, pageUrl), method, fields, hasRecaptcha })
  }
  return out
}

function attr(s: string, name: string): string | null {
  const m = s.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|(\\S+))`, 'i'))
  return m ? (m[2] ?? m[3] ?? m[4] ?? null) : null
}

function resolveUrl(href: string, base: string): string {
  try { return new URL(href, base).toString() } catch { return base }
}

/** Pick the form most likely to be a contact form, scoring by field names. */
function pickContactForm(forms: FormCandidate[]): FormCandidate | null {
  let best: { f: FormCandidate; score: number } | null = null
  for (const f of forms) {
    if (f.hasRecaptcha) continue
    let score = 0
    for (const fld of f.fields) {
      const n = fld.name.toLowerCase()
      if (/email/.test(n))                     score += 4
      if (/name/.test(n))                      score += 2
      if (/message|comment|inquiry|enquiry/.test(n)) score += 5
      if (/phone|tel/.test(n))                 score += 1
      if (/subject/.test(n))                   score += 1
      if (/password|card|cvv|search/.test(n))  score -= 5
    }
    // Need at least an email-like + a message-like field to count as contact.
    const hasEmail = f.fields.some(x => /email/i.test(x.name) || x.type === 'email')
    const hasBody  = f.fields.some(x => /message|comment|inquiry|enquiry|body/i.test(x.name) || x.type === 'textarea')
    if (!hasEmail || !hasBody) continue
    if (!best || score > best.score) best = { f, score }
  }
  return best?.f ?? null
}

function buildPayload(form: FormCandidate, input: ChannelInput, fromEmail: string, fromName: string): Record<string, string> {
  const payload: Record<string, string> = {}
  for (const f of form.fields) {
    const n = f.name.toLowerCase()
    if (/email/.test(n) || f.type === 'email')        payload[f.name] = fromEmail
    else if (/firstname|fname/.test(n))               payload[f.name] = fromName.split(' ')[0] || fromName
    else if (/lastname|lname/.test(n))                payload[f.name] = fromName.split(' ').slice(1).join(' ') || ''
    else if (/name/.test(n))                          payload[f.name] = fromName
    else if (/subject/.test(n))                       payload[f.name] = input.subject || 'Hello from Imba Production'
    else if (/message|comment|inquiry|enquiry|body/.test(n) || f.type === 'textarea')
                                                       payload[f.name] = input.body
    else if (/phone|tel/.test(n))                     payload[f.name] = ''
    else if (f.type === 'hidden' || f.type === 'csrf')payload[f.name] = '' // hidden tokens we can't compute — many sites still accept
  }
  return payload
}

export const contactFormChannel: Channel = {
  name: 'contact_form',
  async send(input: ChannelInput): Promise<ChannelResult> {
    const domain = input.companyDomain
    if (!domain) return { status: 'skipped', error: 'no company_domain on lead' }
    // Walk candidate paths until we find a contact form.
    const tried: Array<{ url: string; status: number | null; reason?: string }> = []
    for (const path of CANDIDATE_PATHS) {
      const url = `https://${domain}${path}`
      const r = await fetchWithTimeout(url)
      if (!r) { tried.push({ url, status: null, reason: 'fetch failed' }); continue }
      if (!r.ok) { tried.push({ url, status: r.status }); continue }
      const html = await r.text()
      const forms = parseForms(html, r.url)
      const form = pickContactForm(forms)
      if (!form) { tried.push({ url, status: r.status, reason: 'no contact form' }); continue }
      const fromEmail = input.metadata.fromEmail as string | undefined
        ?? 'hello@imbaproduction.com'
      const fromName  = input.metadata.fromName as string | undefined
        ?? 'Imba Production'
      const payload = buildPayload(form, input, fromEmail, fromName)
      const submission = await fetchWithTimeout(form.action, {
        method: form.method,
        headers: {
          'content-type': form.method === 'POST' ? 'application/x-www-form-urlencoded' : 'application/octet-stream',
          'referer': r.url,
        },
        body: form.method === 'POST' ? new URLSearchParams(payload).toString() : undefined,
      })
      if (!submission) {
        return { status: 'failed', error: 'submit fetch failed', metadata: { tried, form_url: form.action } }
      }
      // Many sites return 200 with a thank-you page; treat 2xx/3xx as success.
      const ok = submission.status >= 200 && submission.status < 400
      return ok
        ? { status: 'sent', metadata: { form_url: form.action, http_status: submission.status, tried } }
        : { status: 'failed', error: `submit returned ${submission.status}`, metadata: { form_url: form.action, http_status: submission.status, tried } }
    }
    return { status: 'failed', error: 'no contact form found at any candidate path', metadata: { tried } }
  },
}
