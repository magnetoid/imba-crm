// Imba CRM embeddable chat widget.
//
// Drop one tag into any third-party site:
//   <script async src="https://crm.imbaproduction.com/widget.js"
//           data-imba-accent="#0a0a0a"></script>
//
// On load, this script:
//   1. Mounts a fixed bottom-right launcher button inside a Shadow DOM
//      so host-page styles never collide with ours.
//   2. Persists a `visitor_token` in localStorage; sends it on every
//      request so the conversation survives refreshes.
//   3. Long-polls /api/widget/messages for new staff replies (lands as
//      crm_inbox_messages.direction='outbound' rows from the CRM Inbox).
//   4. POSTs visitor messages to /api/widget/messages — these become
//      crm_inbox_messages.direction='inbound', the existing AI
//      auto-categorize loop annotates them, and they appear with a
//      [Widget] filter pill in the CRM Inbox UI.
//
// Built as a single ~10–15 KB JS file by Vite (rolled to IIFE so it
// can be loaded with a plain <script> tag — no module flags needed).

import { STYLES } from './styles.js'

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  received_at: string
}

interface Config {
  baseUrl: string
  accent: string
  greeting: string
  title: string
  subtitle: string
  poweredBy: boolean
}

const STORAGE_KEY = 'imba_widget_token_v1'
const POLL_INTERVAL_MS = 4000
const MAX_BODY_LENGTH = 4000

function readScriptTag(): Partial<Config> & { src: string } {
  const all = document.querySelectorAll<HTMLScriptElement>('script[src*="widget.js"]')
  const tag = all[all.length - 1] // last (= the one currently being evaluated)
  if (!tag) return { src: '' }
  return {
    src: tag.src,
    accent:    tag.dataset.imbaAccent    || undefined,
    greeting:  tag.dataset.imbaGreeting  || undefined,
    title:     tag.dataset.imbaTitle     || undefined,
    subtitle:  tag.dataset.imbaSubtitle  || undefined,
    poweredBy: tag.dataset.imbaPowered === 'false' ? false : true,
  }
}

function getOrCreateToken(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) return existing
  } catch { /* private mode */ }
  const t = 'wid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
  try { localStorage.setItem(STORAGE_KEY, t) } catch { /* ignore */ }
  return t
}

class ImbaWidget {
  private shadow: ShadowRoot
  private token = getOrCreateToken()
  private conversationId: string | null = null
  private messages: Message[] = []
  private since: string | null = null
  private open = false
  private identified = false
  private cfg: Config
  private polling = false
  private listEl: HTMLDivElement | null = null
  private composerInput: HTMLTextAreaElement | null = null

  constructor(cfg: Partial<Config> & { src: string }) {
    // Derive base URL from the script src (so the widget always talks
    // to the host that served it — no hard-coded crm.imbaproduction.com).
    const u = new URL(cfg.src, location.href)
    this.cfg = {
      baseUrl:  cfg.baseUrl  || `${u.protocol}//${u.host}`,
      accent:   cfg.accent   || '#0a0a0a',
      greeting: cfg.greeting || 'Hi! Have a question about our services? We usually reply within an hour.',
      title:    cfg.title    || 'Talk to our team',
      subtitle: cfg.subtitle || 'Replies go straight to our CRM',
      poweredBy: cfg.poweredBy ?? true,
    }

    // Mount under a fresh host element with closed shadow root so neither
    // our CSS nor host-page CSS can leak across the boundary.
    const host = document.createElement('div')
    host.setAttribute('data-imba-widget', '')
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;'
    document.body.appendChild(host)
    this.shadow = host.attachShadow({ mode: 'open' })
    const styleEl = document.createElement('style')
    styleEl.textContent = STYLES
    this.shadow.appendChild(styleEl)

    const root = document.createElement('div')
    root.className = 'root'
    root.style.setProperty('--imba-accent', this.cfg.accent)
    root.appendChild(this.renderLauncher())
    root.appendChild(this.renderPanel())
    this.shadow.appendChild(root)

    // Fire a single page-view ping so the CRM gets first-party intent
    // data even before the visitor opens the widget. Anonymous events are
    // backfilled onto a lead later, when the visitor identifies.
    void this.ping()

    // Resume an existing conversation if there is one.
    void this.resume().catch(() => { /* ignore */ })
  }

  private async ping() {
    try {
      const utm: Record<string, string> = {}
      const params = new URLSearchParams(location.search)
      for (const k of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content']) {
        const v = params.get(k); if (v) utm[k] = v.slice(0, 200)
      }
      await fetch(`${this.cfg.baseUrl}/track/visit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: this.token,
          url: location.href.slice(0, 1000),
          referrer: document.referrer ? document.referrer.slice(0, 1000) : null,
          utm,
        }),
        keepalive: true,
      })
    } catch { /* don't break the host page on a network error */ }
  }

  private renderLauncher(): HTMLElement {
    const btn = document.createElement('button')
    btn.className = 'launcher'
    btn.setAttribute('aria-label', 'Open chat')
    btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3C7 3 3 6.5 3 11c0 2.3 1.1 4.4 2.9 5.9L5 21l4.3-1.5c.9.2 1.8.3 2.7.3 5 0 9-3.5 9-8s-4-8-9-8z"/></svg>`
    btn.addEventListener('click', () => this.toggle())
    return btn
  }

  private renderPanel(): HTMLElement {
    const panel = document.createElement('div')
    panel.className = 'panel'
    panel.innerHTML = `
      <div class="header">
        <div>
          <h3></h3>
          <p></p>
        </div>
        <button class="close-btn" aria-label="Close chat">
          <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
        </button>
      </div>
      <form class="identify" hidden>
        <input name="name"    placeholder="Your name" autocomplete="name" required />
        <input name="email"   placeholder="Email — so we can follow up"  type="email" autocomplete="email" required />
        <input name="company" placeholder="Company (optional)" autocomplete="organization" />
        <button type="submit" style="background: var(--imba-accent); color: #fff; border: 0; border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer;">Start chat</button>
        <p>We use this to reach out by email if you close the chat. No spam, ever.</p>
      </form>
      <div class="messages" hidden></div>
      <form class="composer" hidden>
        <textarea name="body" placeholder="Type a message…" rows="1" required></textarea>
        <button type="submit" aria-label="Send">→</button>
      </form>
      <div class="footer" hidden></div>
    `
    panel.querySelector<HTMLHeadingElement>('h3')!.textContent = this.cfg.title
    panel.querySelector<HTMLParagraphElement>('.header p')!.textContent = this.cfg.subtitle
    panel.querySelector<HTMLButtonElement>('.close-btn')!.addEventListener('click', () => this.toggle(false))

    const idForm = panel.querySelector<HTMLFormElement>('.identify')!
    idForm.addEventListener('submit', e => {
      e.preventDefault()
      const fd = new FormData(idForm)
      void this.identify({
        name:    String(fd.get('name')    || ''),
        email:   String(fd.get('email')   || ''),
        company: String(fd.get('company') || ''),
      })
    })

    const composer = panel.querySelector<HTMLFormElement>('.composer')!
    this.composerInput = composer.querySelector<HTMLTextAreaElement>('textarea')!
    this.composerInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        composer.requestSubmit()
      }
    })
    composer.addEventListener('submit', e => {
      e.preventDefault()
      const value = this.composerInput!.value.trim()
      if (!value) return
      this.composerInput!.value = ''
      void this.send(value)
    })

    if (this.cfg.poweredBy) {
      const f = panel.querySelector<HTMLDivElement>('.footer')!
      f.hidden = false
      f.innerHTML = 'Powered by <a href="https://crm.imbaproduction.com" target="_blank" rel="noopener">imba.crm</a>'
    }

    this.listEl = panel.querySelector<HTMLDivElement>('.messages')!
    return panel
  }

  private async resume() {
    // Ask the server if we already have an open conversation. If yes,
    // skip the identity form and load history.
    const r = await this.request('GET', `/api/widget/conversations?token=${encodeURIComponent(this.token)}`)
    if (r.ok && r.data.conversation_id) {
      this.conversationId = r.data.conversation_id
      this.identified = !!r.data.identified
      await this.loadHistory()
      this.startPolling()
    }
    this.refreshUi()
  }

  private async identify(input: { name: string; email: string; company: string }) {
    if (!input.email) return
    const origin = location.href
    const r = await this.request('POST', '/api/widget/conversations', {
      token: this.token,
      name: input.name,
      email: input.email,
      company: input.company,
      origin,
    })
    if (r.ok) {
      this.conversationId = r.data.conversation_id
      this.identified = true
      this.refreshUi()
      // Seed a greeting so the panel isn't empty.
      this.messages = [{
        id: 'greeting',
        direction: 'outbound',
        body: this.cfg.greeting,
        received_at: new Date().toISOString(),
      }]
      this.renderMessages()
      this.startPolling()
    }
  }

  private async send(body: string) {
    if (!this.conversationId) return
    if (body.length > MAX_BODY_LENGTH) body = body.slice(0, MAX_BODY_LENGTH)
    // Optimistically append.
    const tempId = 'tmp_' + Math.random().toString(36).slice(2)
    this.messages.push({ id: tempId, direction: 'inbound', body, received_at: new Date().toISOString() })
    this.renderMessages()
    const r = await this.request('POST', '/api/widget/messages', {
      token: this.token,
      conversation_id: this.conversationId,
      body,
    })
    if (!r.ok) {
      // Mark as failed (very simple: remove + show toast-ish).
      this.messages = this.messages.filter(m => m.id !== tempId)
      this.renderMessages()
    }
  }

  private async loadHistory() {
    if (!this.conversationId) return
    const r = await this.request('GET', `/api/widget/messages?token=${encodeURIComponent(this.token)}&conversation_id=${this.conversationId}`)
    if (r.ok && Array.isArray(r.data.messages)) {
      this.messages = r.data.messages
      this.since = r.data.cursor || null
      this.renderMessages()
    }
  }

  private startPolling() {
    if (this.polling) return
    this.polling = true
    const tick = async () => {
      if (!this.polling || !this.conversationId) return
      try {
        const url = `/api/widget/messages?token=${encodeURIComponent(this.token)}&conversation_id=${this.conversationId}` +
          (this.since ? `&since=${encodeURIComponent(this.since)}` : '')
        const r = await this.request('GET', url)
        if (r.ok && Array.isArray(r.data.messages) && r.data.messages.length > 0) {
          this.messages = this.messages.concat(r.data.messages)
          this.since = r.data.cursor || this.since
          this.renderMessages()
        }
      } catch { /* ignore */ }
      setTimeout(tick, POLL_INTERVAL_MS)
    }
    tick()
  }

  private renderMessages() {
    if (!this.listEl) return
    if (this.messages.length === 0) {
      this.listEl.innerHTML = `<div class="empty">${escapeHtml(this.cfg.greeting)}</div>`
      return
    }
    this.listEl.innerHTML = this.messages.map(m => {
      const cls = m.direction === 'inbound' ? 'in' : 'out'
      // Render visitor's own messages on the right (acts like our 'out')
      // and staff replies on the left (acts like 'in') — flip:
      const visualCls = m.direction === 'inbound' ? 'out' : 'in'
      void cls
      return `<div class="msg ${visualCls}">${escapeHtml(m.body)}</div>`
    }).join('')
    this.listEl.scrollTop = this.listEl.scrollHeight
  }

  private refreshUi() {
    if (!this.shadow) return
    const idForm   = this.shadow.querySelector<HTMLFormElement>('.identify')
    const list     = this.shadow.querySelector<HTMLDivElement>('.messages')
    const composer = this.shadow.querySelector<HTMLFormElement>('.composer')
    if (!idForm || !list || !composer) return
    if (this.identified && this.conversationId) {
      idForm.hidden = true
      list.hidden = false
      composer.hidden = false
    } else {
      idForm.hidden = false
      list.hidden = true
      composer.hidden = true
    }
  }

  private toggle(force?: boolean) {
    this.open = force ?? !this.open
    const panel = this.shadow.querySelector<HTMLDivElement>('.panel')
    if (panel) panel.classList.toggle('open', this.open)
    this.refreshUi()
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown) {
    try {
      const res = await fetch(`${this.cfg.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        // We deliberately don't send credentials — the widget is
        // unauthenticated; visitor identity flows through `token`.
      })
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok, status: res.status, data }
    } catch (err) {
      return { ok: false, status: 0, data: {}, err }
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string))
}

// Bootstrap. Multiple <script> tags are tolerated — the second one is a
// no-op once the first has mounted.
if (typeof window !== 'undefined' && !(window as any).__imbaWidgetMounted) {
  ;(window as any).__imbaWidgetMounted = true
  const cfg = readScriptTag()
  if (cfg.src) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => new ImbaWidget(cfg))
    } else {
      new ImbaWidget(cfg)
    }
  }
}
