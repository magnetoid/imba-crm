import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Seo from '@/components/Seo'

const SERVICES = [
  'Brand & Commercial Video',
  'AI-Powered Video',
  'Product & Ecommerce Video',
  'Short & Social Video',
  'Post Production & VFX',
  'Drone & Aerial',
  'eLearning Video',
  'Other',
]

const BUDGETS = [
  'Under $5,000',
  '$5,000 – $15,000',
  '$15,000 – $30,000',
  '$30,000 – $75,000',
  '$75,000+',
]

const FAQ = [
  {
    q: 'How long does a typical project take?',
    a: 'Most brand video projects are delivered in 2–4 weeks from brief to final cut. Rush delivery in 48–72 hours is available for product and social content.',
  },
  {
    q: 'Do you work with international clients?',
    a: 'Yes — we work remotely with brands across North America, Europe, and the Middle East. For on-location shoots we travel globally.',
  },
  {
    q: 'What does the creative process look like?',
    a: 'We start with a discovery call to understand your goals, then deliver a concept, script, and production plan. Once approved, we shoot, edit, and deliver. You get two rounds of revisions included.',
  },
  {
    q: 'Can you handle everything in-house?',
    a: 'Yes — from pre-production and scripting through shoot, post-production, colour grade, and sound design. We also have dedicated AI video and drone capabilities.',
  },
]

export default function Contact() {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    company: '',
    service_type: '',
    budget_range: '',
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name || !form.email || !form.message) {
      setError('Please fill in name, email and message.')
      return
    }
    setSubmitting(true)
    setError('')
    const { error: err } = await supabase.from('quote_requests').insert([form])
    setSubmitting(false)
    if (err) {
      setError('Something went wrong. Please try again or email us directly.')
    } else {
      setSubmitted(true)
    }
  }

  return (
    <>
      <Seo
        title="Contact — Free Strategy Call in 24 Hours"
        description="Tell us what you're trying to achieve. We'll reply in 24 hours with a creative plan and a fixed-price quote — free, with zero pressure."
        canonicalPath="/contact"
      />

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="pt-36 pb-20 px-6 lg:px-12 bg-ink relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }} />
        <div className="max-w-screen-xl mx-auto relative z-10">
          <p className="eyebrow mb-6 reveal">Free strategy call · 24h reply</p>
          <h1 className="font-display font-light leading-none mb-6 reveal reveal-delay-1"
            style={{ fontSize: 'clamp(3rem, 6vw, 5.5rem)' }}>
            Tell us your goal.<br />
            <em className="text-gold italic">We&apos;ll build the video.</em>
          </h1>
          <p className="text-smoke-dim text-lg max-w-xl reveal reveal-delay-2"
            style={{ fontWeight: 300 }}>
            Walk away with a creative plan and a fixed-price quote — even if you don&apos;t hire us. One reply, 24 hours, zero pressure.
          </p>
        </div>
      </section>

      {/* ── FORM + INFO ──────────────────────────────────────── */}
      <section className="py-20 px-6 lg:px-12 bg-ink-2">
        <div className="max-w-screen-xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-16">

          {/* Form */}
          <div className="lg:col-span-3">
            {submitted ? (
              <div className="flex flex-col items-start gap-6 py-12">
                <div className="w-12 h-12 rounded-full bg-ember/15 flex items-center justify-center">
                  <span className="text-ember text-xl">✓</span>
                </div>
                <div>
                  <h2 className="font-display font-light text-3xl text-smoke mb-3">
                    Message sent.
                  </h2>
                  <p className="text-smoke-dim text-base" style={{ fontWeight: 300 }}>
                    We'll be in touch within 24 hours. In the meantime, browse{' '}
                    <a href="/work" className="text-smoke underline underline-offset-4 hover:text-ember transition-colors">our work</a>.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="form-label">Full name *</label>
                    <input className="form-input" type="text" placeholder="Jane Smith"
                      value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Email *</label>
                    <input className="form-input" type="email" placeholder="jane@company.com"
                      value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="form-label">Company</label>
                  <input className="form-input" type="text" placeholder="Your company or brand"
                    value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="form-label">Service type</label>
                    <select className="form-select" value={form.service_type}
                      onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))}>
                      <option value="">Select a service</option>
                      {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Budget range</label>
                    <select className="form-select" value={form.budget_range}
                      onChange={e => setForm(f => ({ ...f, budget_range: e.target.value }))}>
                      <option value="">Select a range</option>
                      {BUDGETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label">Tell us about your project *</label>
                  <textarea className="form-textarea" rows={5}
                    placeholder="What are you creating? What's the goal? Any timeline or format requirements?"
                    value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
                </div>

                {error && (
                  <p className="text-ember text-sm">{error}</p>
                )}

                <div>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Sending…' : 'Send message →'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Contact info */}
          <div className="lg:col-span-2 flex flex-col gap-10">
            <div>
              <p className="eyebrow mb-5">Direct contact</p>
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-mono-custom text-[0.65rem] tracking-wider text-smoke-faint uppercase mb-1">Email</p>
                  <a href="mailto:hello@imbaproduction.com"
                    className="text-smoke hover:text-ember transition-colors text-base">
                    hello@imbaproduction.com
                  </a>
                </div>
                <div>
                  <p className="font-mono-custom text-[0.65rem] tracking-wider text-smoke-faint uppercase mb-1">Address</p>
                  <p className="text-smoke-dim text-base" style={{ fontWeight: 300 }}>
                    007 N Orange St, 4th Floor<br />
                    Suite #3601<br />
                    Wilmington, DE 19801
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="eyebrow mb-5">Response time</p>
              <p className="text-smoke-dim text-base" style={{ fontWeight: 300 }}>
                We respond to all project enquiries within <span className="text-smoke">24 hours</span>, Monday to Friday.
              </p>
            </div>

            <div>
              <p className="eyebrow mb-5">Follow our work</p>
              <div className="flex gap-4">
                {[
                  { label: 'Instagram', href: 'https://instagram.com/imbaproduction' },
                  { label: 'YouTube', href: 'https://youtube.com/@imbaproduction' },
                  { label: 'LinkedIn', href: 'https://linkedin.com/company/imbaproduction' },
                ].map(({ label, href }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="font-mono-custom text-[0.65rem] tracking-wider text-smoke-faint hover:text-smoke uppercase transition-colors">
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section className="py-20 px-6 lg:px-12 bg-ink">
        <div className="max-w-screen-xl mx-auto">
          <p className="eyebrow mb-8 reveal">Common questions</p>
          <div className="max-w-2xl flex flex-col divide-y divide-white/8">
            {FAQ.map((item, i) => (
              <div key={i} className="py-5">
                <button
                  className="w-full flex items-center justify-between text-left gap-4 group"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-display font-light text-lg text-smoke group-hover:text-smoke transition-colors">
                    {item.q}
                  </span>
                  <span className="text-smoke-faint flex-shrink-0 transition-transform duration-200"
                    style={{ transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0deg)' }}>
                    +
                  </span>
                </button>
                {openFaq === i && (
                  <p className="mt-3 text-smoke-dim text-base leading-relaxed" style={{ fontWeight: 300 }}>
                    {item.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BAND ─────────────────────────────────────────── */}
      <section className="py-16 px-6 lg:px-12 bg-ember">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="font-display font-light text-2xl text-white mb-1">
              Prefer to skip the form?
            </p>
            <p className="text-white/70 text-sm" style={{ fontWeight: 300 }}>
              We&apos;ve got space for 3 more projects this month — email us now.
            </p>
          </div>
          <a href="mailto:hello@imbaproduction.com"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-ember font-mono-custom text-xs tracking-widest uppercase hover:bg-smoke transition-colors flex-shrink-0">
            Email us directly →
          </a>
        </div>
      </section>
    </>
  )
}
