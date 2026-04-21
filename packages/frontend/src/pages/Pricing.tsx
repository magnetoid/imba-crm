import { Link } from 'react-router-dom'
import Seo from '@/components/Seo'
import { useQuoteModal } from '@/contexts/QuoteModalContext'

// ── Packages ───────────────────────────────────────────────
const PACKAGES = [
  {
    name: 'Starter',
    tagline: 'Social-first content',
    price: '1,500',
    unit: 'per video',
    color: '#3CBFAE',
    popular: false,
    description: 'Perfect for brands that need regular short-form content for social channels.',
    includes: [
      'Up to 60-second video',
      '1 shooting day',
      'Basic colour grade',
      '3 social cutdowns (9:16, 1:1, 16:9)',
      '2 rounds of revisions',
      'H.264 delivery',
    ],
    bestFor: 'TikTok · Reels · Social ads',
  },
  {
    name: 'Growth',
    tagline: 'Brand & product films',
    price: '5,000',
    unit: 'starting from',
    color: '#C9A96E',
    popular: false,
    description: 'Brand films, product showcases, and campaign videos that convert.',
    includes: [
      'Up to 3-minute brand video',
      '1–2 shooting days',
      'Full colour grade + sound design',
      'Script + storyboard included',
      'Motion graphics titles',
      '3 rounds of revisions',
      'All platform formats delivered',
    ],
    bestFor: 'Brand films · Product video · YouTube',
  },
  {
    name: 'Premium',
    tagline: 'Campaign production',
    price: '15,000',
    unit: 'starting from',
    color: '#E8452A',
    popular: true,
    description: 'Full campaign productions with multiple deliverables, crew, and broadcast quality.',
    includes: [
      'Multi-video campaign package',
      '2–5 shooting days',
      'Full production crew',
      'Location scouting + casting',
      'Broadcast-quality post-production',
      'Complete asset suite (all formats)',
      'Dedicated account manager',
      'Rush delivery option (48h)',
    ],
    bestFor: 'Commercial campaigns · TV · Broadcast',
  },
  {
    name: 'Enterprise',
    tagline: 'Ongoing partnership',
    price: 'Custom',
    unit: 'tailored to you',
    color: '#6C7AE0',
    popular: false,
    description: 'Monthly retainers, white-label partnerships, and large-scale content programmes.',
    includes: [
      'Monthly content calendar',
      'Dedicated production team',
      'Priority scheduling',
      'White-label available for agencies',
      'Volume discounts',
      'Dedicated account manager',
      'Performance reporting',
      'Flexible scope per month',
    ],
    bestFor: 'Agencies · Brands · In-house teams',
  },
]

// ── Per-service starting prices ────────────────────────────
const SERVICE_PRICES = [
  { icon: '▶', label: 'Brand & Commercial Video', from: '$3,500', note: 'Includes script, shoot & post' },
  { icon: '◈', label: 'AI-Powered Video',         from: '$2,500', note: 'AI generation + human QA' },
  { icon: '▣', label: 'Product & Ecommerce Video', from: '$1,200', note: 'Per SKU batch pricing available' },
  { icon: '◉', label: 'Short & Social Video',      from: '$800',   note: 'Per clip, volume discounts' },
  { icon: '◎', label: 'Cooking & Food Video',      from: '$1,500', note: 'Food styling included' },
  { icon: '◬', label: 'Drone & Aerial',            from: '$1,800', note: 'Licensed operators, 4K' },
  { icon: '◫', label: 'Post Production only',      from: '$600',   note: 'Edit, grade & sound design' },
  { icon: '⊡', label: 'eLearning & Corporate',     from: '$2,000', note: 'Per module, scriptwriting incl.' },
  { icon: '◻', label: 'Fashion & Lifestyle',       from: '$2,200', note: 'Full styling & direction' },
  { icon: '◷', label: 'Testimonial Video',         from: '$900',   note: 'Includes interview filming' },
]

// ── FAQ ────────────────────────────────────────────────────
const FAQ = [
  {
    q: 'Are these prices fixed or do they vary by project?',
    a: 'The prices shown are starting points. Every project is scoped individually — complexity, location, number of deliverables, and timeline all affect the final price. We always provide a detailed quote before any work begins.',
  },
  {
    q: 'What is included in the price?',
    a: 'All packages include pre-production planning, scripting guidance, shoot day(s), editing, colour grading, and final delivery in all required formats. Starter and Growth packages include a set number of revision rounds. Premium and Enterprise include unlimited revisions within scope.',
  },
  {
    q: 'Do you offer volume discounts for multiple videos?',
    a: "Yes — significant discounts apply when shooting multiple videos in the same session. Shooting 5 product videos in one day is far more cost-efficient than five separate shoot days. We'll build a custom batch-production plan for you.",
  },
  {
    q: 'Can you work within a tight budget?',
    a: "Often, yes. Tell us your budget and we'll work backwards to find the best approach for it. Sometimes a smart creative solution delivers better results than a bigger budget spent poorly.",
  },
  {
    q: 'How long does a typical project take?',
    a: 'Social content (Starter): 5–10 business days. Brand videos (Growth): 2–4 weeks. Full campaigns (Premium): 4–8 weeks. Rush delivery in 48–72 hours is available for product and social content at an additional fee.',
  },
  {
    q: 'Do you offer monthly retainers?',
    a: 'Yes — our Enterprise plan is built around monthly content partnerships. We assign a dedicated team to your account, plan a content calendar each month, and produce at a volume-discounted rate. Ideal for brands that need consistent output.',
  },
  {
    q: 'What does the 48h turnaround option actually mean?',
    a: 'We can shoot on Day 1 and deliver a fully edited, colour-graded, ready-to-publish video within 48 hours. This applies primarily to product videos, social clips, and simple brand content. It requires pre-approved scripts and briefs before shoot day.',
  },
]

export default function Pricing() {
  const { openModal } = useQuoteModal()

  return (
    <>
      <Seo
        title="Video Production Pricing — Packages & Rates"
        description="Transparent video production pricing. Starter from $1,500, Growth from $5,000, Premium from $15,000, Enterprise custom. Free quote in 24 hours."
        canonicalPath="/pricing"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            'mainEntity': FAQ.map(item => ({
              '@type': 'Question',
              'name': item.q,
              'acceptedAnswer': { '@type': 'Answer', 'text': item.a },
            })),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'PriceSpecification',
            'name': 'Video Production Pricing',
            'description': 'Video production packages starting from $1,500',
            'url': 'https://imbaproduction.com/pricing',
          },
        ]}
      />

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="pt-36 pb-20 px-6 lg:px-12 bg-ink relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }} />
        <div className="absolute top-0 right-0 w-[50vw] h-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 70% at 100% 30%, rgba(232,69,42,0.06) 0%, transparent 65%)' }}
        />
        <div className="max-w-screen-xl mx-auto relative z-10">
          <div className="max-w-2xl">
            <p className="eyebrow mb-6 reveal">Pricing</p>
            <h1 className="font-display font-light leading-none mb-6 reveal reveal-delay-1"
              style={{ fontSize: 'clamp(3rem, 6vw, 5.5rem)' }}>
              Transparent pricing<br />
              <em className="text-ember italic">for every budget.</em>
            </h1>
            <p className="text-smoke-dim leading-relaxed reveal reveal-delay-2"
              style={{ fontSize: '1.05rem', fontWeight: 300, maxWidth: '520px' }}>
              Every project is quoted individually — the ranges below give you a clear starting point. Free quote within 24 hours, no commitment required.
            </p>
            <div className="flex flex-wrap gap-4 mt-10 reveal reveal-delay-3">
              <button onClick={() => openModal()} className="btn btn-primary">
                Get a free quote →
              </button>
              <a href="#packages" className="btn btn-ghost">
                View packages
              </a>
            </div>
          </div>

          {/* Trust bar */}
          <div className="mt-14 flex flex-wrap gap-x-10 gap-y-3 reveal reveal-delay-3">
            {[
              '✓  Free quote within 24 hours',
              '✓  No hidden costs',
              '✓  48h rush delivery available',
              '✓  All formats included',
            ].map(t => (
              <span key={t} className="font-mono-custom text-[0.62rem] tracking-wider text-smoke-faint/50 uppercase">{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PACKAGE CARDS ────────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12 bg-ink-2" id="packages">
        <div className="max-w-screen-xl mx-auto">
          <div className="text-center mb-14">
            <p className="eyebrow mb-4 reveal">Packages</p>
            <h2 className="font-display font-light leading-tight reveal reveal-delay-1"
              style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}>
              Find the right<br /><em className="text-gold italic">package for you</em>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PACKAGES.map((pkg, i) => (
              <div
                key={pkg.name}
                className="relative flex flex-col border border-white/8 bg-ink hover:border-white/15 transition-all duration-300 reveal"
                style={{
                  transitionDelay: `${i * 80}ms`,
                  borderTopWidth: '2px',
                  borderTopColor: pkg.popular ? pkg.color : 'rgba(255,255,255,0.08)',
                }}
              >
                {pkg.popular && (
                  <div className="absolute -top-px left-0 right-0 h-0.5" style={{ background: pkg.color }} />
                )}
                {pkg.popular && (
                  <div className="absolute top-4 right-4 font-mono-custom text-[0.55rem] tracking-widest uppercase px-2 py-1"
                    style={{ background: `${pkg.color}18`, color: pkg.color, border: `1px solid ${pkg.color}35` }}>
                    Most popular
                  </div>
                )}

                <div className="p-7 flex-1 flex flex-col">
                  {/* Header */}
                  <div className="mb-6">
                    <span className="font-mono-custom text-[0.6rem] tracking-[0.2em] uppercase mb-2 block" style={{ color: pkg.color }}>
                      {pkg.tagline}
                    </span>
                    <h3 className="font-display font-light text-smoke text-3xl mb-1">{pkg.name}</h3>
                    <p className="text-smoke-dim text-sm leading-relaxed" style={{ fontWeight: 300 }}>
                      {pkg.description}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="mb-6 pb-6 border-b border-white/6">
                    <div className="flex items-end gap-1.5">
                      {pkg.price !== 'Custom' && (
                        <span className="font-mono-custom text-[0.6rem] tracking-wider text-smoke-faint mt-1">from $</span>
                      )}
                      <span className="font-display font-light text-smoke leading-none" style={{ fontSize: '2.2rem' }}>
                        {pkg.price}
                      </span>
                    </div>
                    <span className="font-mono-custom text-[0.6rem] tracking-widest uppercase text-smoke-faint/50 mt-1 block">
                      {pkg.unit}
                    </span>
                  </div>

                  {/* Includes */}
                  <ul className="flex flex-col gap-2.5 mb-8 flex-1">
                    {pkg.includes.map(item => (
                      <li key={item} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex-shrink-0 text-[0.7rem]" style={{ color: pkg.color }}>✓</span>
                        <span className="text-smoke-dim text-sm leading-snug" style={{ fontWeight: 300 }}>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Best for */}
                  <div className="mb-6">
                    <span className="font-mono-custom text-[0.55rem] tracking-[0.18em] uppercase text-smoke-faint/40">Best for: </span>
                    <span className="font-mono-custom text-[0.55rem] tracking-wider text-smoke-faint/50">{pkg.bestFor}</span>
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => openModal(pkg.name + ' package')}
                    className="w-full font-mono-custom text-[0.65rem] tracking-[0.14em] uppercase py-3 transition-all"
                    style={{
                      background: pkg.popular ? pkg.color : 'transparent',
                      color: pkg.popular ? '#0A0A0B' : pkg.color,
                      border: `1px solid ${pkg.color}${pkg.popular ? '' : '60'}`,
                    }}
                    onMouseEnter={e => {
                      if (!pkg.popular) {
                        (e.currentTarget as HTMLButtonElement).style.background = `${pkg.color}15`
                      }
                    }}
                    onMouseLeave={e => {
                      if (!pkg.popular) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                      }
                    }}
                  >
                    {pkg.price === 'Custom' ? 'Get a custom quote' : 'Get a quote →'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center font-mono-custom text-[0.6rem] tracking-widest uppercase text-smoke-faint/30 mt-8 reveal">
            All prices in USD · VAT / tax may apply depending on your location
          </p>
        </div>
      </section>

      {/* ── PER-SERVICE PRICING ────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12 bg-ink">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-14">
            <div>
              <p className="eyebrow mb-4 reveal">By service</p>
              <h2 className="font-display font-light leading-tight reveal reveal-delay-1"
                style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}>
                Starting prices<br /><em className="text-gold italic">per service type</em>
              </h2>
            </div>
            <p className="text-smoke-dim text-sm max-w-xs reveal reveal-delay-1" style={{ fontWeight: 300 }}>
              Prices shown are starting points. Your actual quote depends on scope, timeline, and deliverables.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5">
            {SERVICE_PRICES.map((svc, i) => (
              <div
                key={svc.label}
                className="bg-ink p-8 group hover:bg-ink-2 transition-colors reveal"
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 border border-white/10 flex items-center justify-center text-sm text-smoke-faint group-hover:border-ember/30 group-hover:text-ember transition-colors">
                        {svc.icon}
                      </div>
                      <span className="font-mono-custom text-[0.62rem] tracking-wider uppercase text-smoke-dim">{svc.label}</span>
                    </div>
                    <div className="flex items-end gap-2 mb-2">
                      <span className="font-mono-custom text-[0.58rem] tracking-wider text-smoke-faint/50 mb-0.5">from</span>
                      <span className="font-display font-light text-smoke text-3xl leading-none">{svc.from}</span>
                    </div>
                    <p className="font-mono-custom text-[0.57rem] tracking-wider text-smoke-faint/40 uppercase">{svc.note}</p>
                  </div>
                  <button
                    onClick={() => openModal(svc.label)}
                    className="flex-shrink-0 font-mono-custom text-[0.58rem] tracking-widest uppercase text-smoke-faint/30 hover:text-ember transition-colors opacity-0 group-hover:opacity-100 mt-1"
                  >
                    Quote →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT'S INCLUDED ────────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12 bg-ink-2">
        <div className="max-w-screen-xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="eyebrow mb-4 reveal">What you get</p>
              <h2 className="font-display font-light leading-tight mb-8 reveal reveal-delay-1"
                style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}>
                Every project includes<br /><em className="text-gold italic">these essentials</em>
              </h2>
              <p className="text-smoke-dim leading-relaxed reveal reveal-delay-2" style={{ fontWeight: 300 }}>
                Regardless of package or budget, every Imba Production project comes with the same commitment to craft, strategy, and service.
              </p>

              <div className="mt-10 flex flex-col gap-4 reveal reveal-delay-2">
                {[
                  {
                    title: 'Strategic creative brief',
                    desc: 'We start with your goals, not our cameras. Every project opens with a written creative brief that aligns intent with execution.',
                  },
                  {
                    title: 'Script & concept development',
                    desc: "Script, concept notes, and key message guidance included in all packages. You know exactly what you're getting before shoot day.",
                  },
                  {
                    title: 'Professional broadcast kit',
                    desc: 'Sony FX, ARRI lighting, DJI drones, motorised sliders, DIT station. The right tools, always — regardless of budget.',
                  },
                  {
                    title: 'Full post-production',
                    desc: 'Editing, colour grading in DaVinci Resolve, sound design, and music licensing. Complete — not a rough cut.',
                  },
                  {
                    title: 'All platform formats',
                    desc: '16:9, 9:16, 1:1 — every deliverable comes in all formats for every channel you need.',
                  },
                  {
                    title: '24-hour client communication',
                    desc: 'Questions answered within 24 hours. Your project moves, your questions get answered — no waiting.',
                  },
                ].map(({ title, desc }, i) => (
                  <div key={title} className="flex gap-4 reveal" style={{ transitionDelay: `${i * 60}ms` }}>
                    <div className="w-5 h-5 border border-ember/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-1.5 h-1.5 bg-ember" />
                    </div>
                    <div>
                      <p className="text-smoke text-sm font-medium mb-1">{title}</p>
                      <p className="text-smoke-dim text-sm leading-relaxed" style={{ fontWeight: 300 }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Side card */}
            <div className="reveal reveal-delay-2">
              <div className="border border-white/8 p-10 bg-ink">
                <p className="font-mono-custom text-[0.62rem] tracking-[0.2em] uppercase text-ember mb-6">
                  Optional add-ons
                </p>
                <div className="flex flex-col gap-5">
                  {[
                    { label: '48h rush delivery',        note: '+30% of project value' },
                    { label: 'Additional shooting day',  note: 'From $1,200/day' },
                    { label: 'Casting & talent',         note: 'From $500 per talent' },
                    { label: 'Location scouting',        note: 'From $400' },
                    { label: 'Studio hire',              note: 'From $600/day' },
                    { label: 'Subtitles & captions',     note: 'From $150/video' },
                    { label: 'Animated motion graphics', note: 'From $800' },
                    { label: 'Drone footage add-on',     note: 'From $800/day' },
                    { label: 'Music licensing (premium)',note: 'From $250' },
                    { label: 'Extra revision rounds',    note: '$200 per additional round' },
                  ].map(({ label, note }) => (
                    <div key={label} className="flex items-center justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0">
                      <span className="text-sm text-smoke-dim" style={{ fontWeight: 300 }}>{label}</span>
                      <span className="font-mono-custom text-[0.6rem] tracking-wider text-smoke-faint/60 uppercase">{note}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 border border-white/8 p-8 bg-ink">
                <p className="font-mono-custom text-[0.6rem] tracking-[0.2em] uppercase text-gold mb-4">
                  Need something custom?
                </p>
                <p className="text-smoke-dim text-sm leading-relaxed mb-6" style={{ fontWeight: 300 }}>
                  Don't see exactly what you need? We scope every project from scratch. Tell us your goal and budget — we'll build the right solution around it.
                </p>
                <button onClick={() => openModal()} className="btn btn-outline text-[0.65rem] w-full text-center">
                  Request custom quote →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ────────────────────────────────────── */}
      <section className="py-20 px-6 lg:px-12 bg-ink overflow-x-auto">
        <div className="max-w-screen-xl mx-auto">
          <p className="eyebrow mb-4 reveal">Compare</p>
          <h2 className="font-display font-light leading-tight mb-12 reveal reveal-delay-1"
            style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)' }}>
            Package <em className="text-gold italic">comparison</em>
          </h2>

          <div className="min-w-[640px] reveal">
            {/* Header row */}
            <div className="grid grid-cols-5 mb-2">
              <div className="col-span-1" />
              {PACKAGES.map(pkg => (
                <div key={pkg.name} className="text-center px-2">
                  <span className="font-mono-custom text-[0.62rem] tracking-widest uppercase" style={{ color: pkg.color }}>
                    {pkg.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Rows */}
            {[
              { feature: 'Starting price',        values: ['$1,500', '$5,000', '$15,000', 'Custom'] },
              { feature: 'Shooting days',          values: ['1', '1–2', '2–5', 'Flexible'] },
              { feature: 'Script development',     values: ['Basic', '✓', '✓', '✓'] },
              { feature: 'Colour grade',           values: ['Basic', 'Full', 'Broadcast', 'Broadcast'] },
              { feature: 'Sound design',           values: ['—', '✓', '✓', '✓'] },
              { feature: 'Motion graphics',        values: ['—', 'Titles', 'Full', 'Full'] },
              { feature: 'Platform formats',       values: ['3', 'All', 'All', 'All'] },
              { feature: 'Revision rounds',        values: ['2', '3', 'Unlimited', 'Unlimited'] },
              { feature: '48h rush option',        values: ['—', '✓', '✓', '✓'] },
              { feature: 'Dedicated manager',      values: ['—', '—', '✓', '✓'] },
              { feature: 'White label available',  values: ['—', '—', '—', '✓'] },
            ].map(({ feature, values }, i) => (
              <div key={feature}
                className={`grid grid-cols-5 py-4 border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/[0.015]'}`}>
                <div className="col-span-1 text-smoke-dim text-sm pr-4" style={{ fontWeight: 300 }}>{feature}</div>
                {values.map((val, j) => (
                  <div key={j} className="text-center px-2">
                    <span className={`font-mono-custom text-[0.65rem] tracking-wider ${
                      val === '—' ? 'text-smoke-faint/20' :
                      val === '✓' ? '' : 'text-smoke-dim'
                    }`}
                      style={val === '✓' ? { color: PACKAGES[j].color } : undefined}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12 bg-ink-2">
        <div className="max-w-screen-xl mx-auto max-w-3xl">
          <p className="eyebrow mb-4 reveal">FAQ</p>
          <h2 className="font-display font-light leading-tight mb-12 reveal reveal-delay-1"
            style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}>
            Pricing questions<br /><em className="text-gold italic">answered</em>
          </h2>

          <div className="space-y-0">
            {FAQ.map(({ q, a }, i) => (
              <div key={q}
                className="border-b border-white/5 py-7 reveal"
                style={{ transitionDelay: `${i * 60}ms` }}>
                <div className="flex gap-5">
                  <span className="font-mono-custom text-[0.65rem] text-ember/70 mt-1 min-w-[1.5rem] flex-shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="font-display font-light text-smoke text-xl mb-3">{q}</h3>
                    <p className="text-smoke-dim text-sm leading-relaxed" style={{ fontWeight: 300 }}>{a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BAND ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ background: '#E8452A' }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 8px)',
        }} />
        <div className="relative px-6 lg:px-12 py-20 max-w-screen-xl mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div>
            <h2 className="font-display font-light leading-tight text-ink"
              style={{ fontSize: 'clamp(2.2rem, 4vw, 3.8rem)' }}>
              Ready to get started?<br /><em>Get your free quote today.</em>
            </h2>
            <p className="text-ink/60 mt-3" style={{ fontSize: '0.95rem' }}>
              Free consultation · No commitment · Reply within 24 hours.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => openModal()}
              className="flex-shrink-0 font-mono-custom text-[0.7rem] tracking-[0.14em] uppercase px-8 py-4 cursor-pointer"
              style={{ background: '#0A0A0B', color: '#F5F4F0', border: 'none' }}>
              Get a free quote →
            </button>
            <Link
              to="/services"
              className="flex-shrink-0 font-mono-custom text-[0.65rem] tracking-[0.14em] uppercase text-ink/50 hover:text-ink/80 transition-colors text-center"
            >
              Browse all services →
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
