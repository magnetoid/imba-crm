import { Link } from 'react-router-dom'
import Seo from '@/components/Seo'
import { useQuoteModal } from '@/contexts/QuoteModalContext'

const TEAM = [
  {
    name: 'Ljubica Jevremovic',
    role: 'Partner & Creative Director',
    bio: 'A visionary video producer who has worked for leading Silicon Valley brands. The creative engine of Imba Production — she brings cinematic craft and bold storytelling to every project.',
    initials: 'LJ',
    color: '#C9A96E',
    image: '/team/ljubica.jpg',
    linkedin: 'https://linkedin.com/in/ljubica-jevremovic',
    instagram: 'https://instagram.com/imbaproduction',
  },
  {
    name: 'Marko Tiosavljevic',
    role: 'Partner & Marketing Strategist',
    bio: '20+ years in creative and digital marketing. Ensures every video is built around a clear business strategy — driving leads, sales, and brand equity for clients worldwide.',
    initials: 'MT',
    color: '#E8452A',
    image: '/team/marko.jpg',
    linkedin: 'https://linkedin.com/in/marko-tiosavljevic',
    instagram: 'https://instagram.com/imbaproduction',
  },
]

const VALUES = [
  {
    n: '01',
    title: 'Every frame earns its keep',
    desc: 'Broadcast-quality craft on every project — whether you\'re spending $5K or $50K. Your brand deserves the same polish a Super Bowl spot gets.',
  },
  {
    n: '02',
    title: 'Strategy before camera',
    desc: 'We build every video around your KPIs — more leads, more sales, stronger recall. If a creative choice won\'t move your numbers, we won\'t ship it.',
  },
  {
    n: '03',
    title: 'We\'re part of your team',
    desc: 'No agency bureaucracy, no vendor lock-in. You get direct access to the people making your video — and feedback that lands in hours, not weeks.',
  },
  {
    n: '04',
    title: 'Fast without shortcuts',
    desc: '48-hour turnarounds on rush jobs — same quality standard, same attention to detail. Because your launch date isn\'t a suggestion.',
  },
]

const STATS = [
  { num: '12', sup: '+', label: 'Years producing' },
  { num: '500', sup: '+', label: 'Videos crafted' },
  { num: '20', sup: '+', label: 'Service types' },
  { num: '48', sup: 'h', label: 'Average delivery' },
]

const CLIENTS = [
  'FoodCo International', 'NordShop', 'Velour Boutique', 'Irving Books',
  'Kozica Soaps', 'Ogitive', 'Massive Movie Horse', 'Prime Real Estate',
]

const TESTIMONIALS = [
  {
    name: 'Predrag Kozica',
    company: 'Kozica Soaps',
    text: 'Imba Productions exceeded our expectations with their professionalism and creativity. The results spoke for themselves.',
  },
  {
    name: 'Bojan Ilić',
    role: 'CEO',
    company: 'Massive Movie Horse',
    text: 'Great cooperation with Ljubica and the Imba team. They provided great feedback and guided us through the entire process.',
  },
  {
    name: 'Dragan Dragovic',
    role: 'Developer & SEO Expert',
    company: 'Ogitive',
    text: 'I loved working with Imba Production. Their expertise helped us build a complete ecommerce presence from the ground up.',
  },
]

const SOCIAL = [
  { label: 'Instagram', short: 'IG', href: 'https://instagram.com/imbaproduction' },
  { label: 'LinkedIn',  short: 'LI', href: 'https://linkedin.com/company/imba-production' },
  { label: 'YouTube',   short: 'YT', href: 'https://youtube.com/channel/UCV4zBHquBoo4NLw0tMi2ZKQ' },
  { label: 'TikTok',    short: 'TK', href: 'https://tiktok.com/@imbaproduction' },
  { label: 'X / Twitter', short: 'X', href: 'https://twitter.com/productionimba' },
]

export default function About() {
  const { openModal } = useQuoteModal()
  return (
    <>
      <Seo
        title="About Imba Production"
        description="A team of creative directors, cinematographers, and AI specialists united by one belief: video is the most powerful medium for brand storytelling."
        canonicalPath="/about"
      />
      {/* ── PAGE HERO ─────────────────────────────────────── */}
      <section className="pt-36 pb-20 px-6 lg:px-12 bg-ink relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }} />
        <div className="absolute top-0 left-0 w-[50vw] h-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 60% at 0% 40%, rgba(201,169,110,0.06) 0%, transparent 65%)' }}
        />
        <div className="relative max-w-screen-xl mx-auto">
          <p className="eyebrow mb-6 reveal">Est. 2012 · Kragujevac, Serbia</p>
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="font-display font-light leading-tight mb-6 reveal reveal-delay-1"
                style={{ fontSize: 'clamp(2.8rem, 5.5vw, 5rem)' }}>
                The video studio<br />
                <em className="text-gold italic">that answers</em><br />
                to your KPIs
              </h1>
              <p className="text-smoke-dim leading-relaxed mb-8 reveal reveal-delay-2" style={{ fontSize: '1rem' }}>
                We build video that drives revenue, not vanity metrics. Cinematic craft, AI-powered speed, and strategy-first thinking — one team that treats your growth like our own.
              </p>
              <div className="flex gap-4 reveal reveal-delay-3">
                <Link to="/work" className="btn btn-primary">See our work</Link>
                <Link to="/contact" className="btn btn-ghost">Get in touch →</Link>
              </div>
            </div>

            {/* Film reel visual */}
            <div className="relative aspect-[4/3] bg-ink-2 border border-white/5 overflow-hidden reveal reveal-delay-2 hidden lg:block">
              <div className="absolute left-4 top-0 bottom-0 flex flex-col gap-1.5 py-3 w-7">
                {Array.from({ length: 22 }).map((_, i) => (
                  <div key={i} className="flex-1 border border-white/6 bg-ink-3" />
                ))}
              </div>
              <div className="absolute right-4 top-0 bottom-0 flex flex-col gap-1.5 py-3 w-7">
                {Array.from({ length: 22 }).map((_, i) => (
                  <div key={i} className="flex-1 border border-white/6 bg-ink-3" />
                ))}
              </div>
              <div className="absolute inset-x-14 inset-y-0 flex flex-col items-center justify-center gap-6 text-center px-6">
                <div className="w-14 h-14 rounded-full flex items-center justify-center border border-ember/25"
                  style={{ background: 'rgba(232,69,42,0.08)' }}>
                  <div style={{ borderLeft: '16px solid rgba(232,69,42,0.6)', borderTop: '10px solid transparent', borderBottom: '10px solid transparent', marginLeft: '3px' }} />
                </div>
                <div>
                  <p className="font-mono-custom text-[0.58rem] tracking-[0.2em] uppercase text-smoke-faint mb-2">Our mission</p>
                  <p className="font-display font-light text-smoke/60 leading-snug" style={{ fontSize: '1.05rem' }}>
                    Make video the highest-ROI<br />line on your marketing budget
                  </p>
                </div>
                <div className="font-mono-custom text-[0.52rem] text-smoke-faint/25 tracking-widest">
                  imbaproduction.com · 2012 – {new Date().getFullYear()}
                </div>
              </div>
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(232,69,42,0.05) 0%, transparent 70%)' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ─────────────────────────────────────────── */}
      <div className="border-y border-white/6 grid grid-cols-2 lg:grid-cols-4">
        {STATS.map(({ num, sup, label }, i) => (
          <div key={label} className={`px-8 lg:px-12 py-8 ${i < 3 ? 'border-r border-white/6' : ''}`}>
            <div className="font-display font-light text-smoke leading-none" style={{ fontSize: '3rem' }}>
              {num}<em className="text-ember not-italic">{sup}</em>
            </div>
            <div className="font-mono-custom text-[0.6rem] tracking-[0.18em] uppercase text-smoke-faint mt-2">{label}</div>
          </div>
        ))}
      </div>

      {/* ── MISSION / WHAT WE DO ──────────────────────────── */}
      <section className="py-24 px-6 lg:px-12 bg-ink-2">
        <div className="max-w-screen-xl mx-auto grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <p className="eyebrow mb-4 reveal">What you get</p>
            <h2 className="font-display font-light leading-tight mb-8 reveal reveal-delay-1"
              style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}>
              Video that actually<br /><em className="text-gold italic">pays for itself</em>
            </h2>
            <div className="space-y-5 text-smoke-dim leading-relaxed reveal reveal-delay-2" style={{ fontSize: '0.95rem' }}>
              <p>Since 2012, we've helped 500+ brands turn video into their highest-performing marketing channel — from founder films that win investors to AI campaigns that scale overnight.</p>
              <p>Cinematic craft plus AI-powered speed. Your video doesn't just look expensive — it drives clicks, conversions, and the kind of brand loyalty that compounds.</p>
              <p>Brand films. Product videos. TikTok. Drone. eLearning. AI campaigns. One team, every format your marketing needs — and one point of contact who knows your goals.</p>
            </div>
          </div>

          {/* Services list */}
          <div className="reveal reveal-delay-2">
            <p className="font-mono-custom text-[0.65rem] tracking-[0.18em] uppercase text-smoke-faint mb-6">What we produce</p>
            <div className="grid grid-cols-2 gap-x-4">
              {[
                'Brand & Commercial Video', 'AI-Powered Video',
                'Product & Ecommerce', 'Cooking & Food Video',
                'TikTok & Social Reels', 'Drone & Aerial',
                'Post Production', 'eLearning Video',
                'Fashion Video', 'Testimonial Videos',
                'YouTube Production', 'White Label Production',
              ].map(s => (
                <div key={s} className="flex items-center gap-2 py-2.5 border-b border-white/5">
                  <div className="w-1 h-1 rounded-full bg-ember flex-shrink-0" />
                  <span className="font-mono-custom text-[0.62rem] tracking-wide text-smoke-dim">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TEAM ──────────────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12 bg-ink">
        <div className="max-w-screen-xl mx-auto">
          <p className="eyebrow mb-4 reveal">The team</p>
          <h2 className="font-display font-light leading-tight mb-14 reveal reveal-delay-1"
            style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}>
            The people behind<br /><em className="text-gold italic">the lens</em>
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl">
            {TEAM.map((member, i) => (
              <div key={member.name}
                className="bg-ink-2 border border-white/5 overflow-hidden hover:border-white/10 transition-colors reveal"
                style={{ transitionDelay: `${i * 100}ms` }}>
                {/* Photo */}
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={member.image}
                    alt={member.name}
                    className="w-full h-full object-cover object-top transition-transform duration-500 hover:scale-105"
                    onError={e => {
                      const el = e.currentTarget
                      el.style.display = 'none'
                      const fallback = el.nextElementSibling as HTMLElement
                      if (fallback) fallback.style.display = 'flex'
                    }}
                  />
                  {/* Fallback initials */}
                  <div className="hidden absolute inset-0 items-center justify-center font-mono-custom text-4xl font-medium"
                    style={{ background: `${member.color}12`, color: member.color }}>
                    {member.initials}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-2/80 to-transparent" />
                </div>
                <div className="p-7">
                  <h3 className="font-display font-light text-smoke text-2xl mb-1">{member.name}</h3>
                  <p className="font-mono-custom text-[0.62rem] tracking-[0.16em] uppercase mb-4" style={{ color: member.color }}>{member.role}</p>
                  <p className="text-smoke-dim leading-relaxed mb-5" style={{ fontSize: '0.88rem' }}>{member.bio}</p>
                  <div className="flex items-center gap-3">
                    {member.linkedin && (
                      <a href={member.linkedin} target="_blank" rel="noopener noreferrer"
                        className="font-mono-custom text-[0.58rem] tracking-widest uppercase text-smoke-faint/40 hover:text-smoke-dim transition-colors">
                        LinkedIn →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="font-mono-custom text-[0.62rem] tracking-widest uppercase text-smoke-faint/35 mt-10 reveal">
            + specialist videographers, editors, colorists, and motion designers across Europe & US
          </p>
        </div>
      </section>

      {/* ── VALUES ────────────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12 bg-ink-2">
        <div className="max-w-screen-xl mx-auto">
          <p className="eyebrow mb-4 reveal">Why choose us</p>
          <h2 className="font-display font-light leading-tight mb-14 reveal reveal-delay-1"
            style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}>
            How we work,<br /><em className="text-gold italic">why it matters</em>
          </h2>
          <div className="grid md:grid-cols-2 gap-px bg-white/5">
            {VALUES.map(({ n, title, desc }, i) => (
              <div key={n}
                className="bg-ink-2 p-10 hover:bg-ink-3 transition-colors reveal"
                style={{ transitionDelay: `${i * 80}ms` }}>
                <span className="font-mono-custom text-[0.65rem] text-ember/70">{n}</span>
                <h3 className="font-display font-light text-smoke text-2xl mt-3 mb-4">{title}</h3>
                <p className="text-smoke-dim leading-relaxed" style={{ fontSize: '0.9rem' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12 bg-ink">
        <div className="max-w-screen-xl mx-auto">
          <p className="eyebrow mb-4 reveal">Client voice</p>
          <h2 className="font-display font-light leading-tight mb-14 reveal reveal-delay-1"
            style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}>
            What our clients <em className="text-gold italic">say</em>
          </h2>
          <div className="grid md:grid-cols-3 gap-px bg-white/5">
            {TESTIMONIALS.map((t, i) => (
              <div key={t.name} className="bg-ink p-8 relative reveal" style={{ transitionDelay: `${i * 100}ms` }}>
                <div className="absolute top-5 right-6 font-display text-[5rem] font-light leading-none select-none"
                  style={{ color: 'rgba(232,69,42,0.05)' }}>"</div>
                <p className="font-display text-lg font-light italic text-smoke/80 leading-relaxed mb-6">{t.text}</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-mono-custom text-[0.6rem]"
                    style={{ background: 'rgba(232,69,42,0.1)', border: '1px solid rgba(232,69,42,0.2)', color: '#E8452A' }}>
                    {t.name.split(' ').map(w => w[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm text-smoke font-medium">{t.name}</p>
                    <p className="font-mono-custom text-[0.58rem] tracking-wider text-smoke-faint">
                      {t.role ? `${t.role} · ` : ''}{t.company}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOLLOW US ─────────────────────────────────────── */}
      <section className="py-16 px-6 lg:px-12 bg-ink border-t border-white/5">
        <div className="max-w-screen-xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-8">
          <div>
            <p className="eyebrow mb-2 reveal">Follow our work</p>
            <h2 className="font-display font-light text-smoke reveal reveal-delay-1" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)' }}>
              Stay inspired — follow <em className="text-gold italic">imba.</em>
            </h2>
          </div>
          <div className="flex flex-wrap gap-3 reveal reveal-delay-2">
            {SOCIAL.map(({ label, short, href }) => (
              <a
                key={short}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 border border-white/10 hover:border-ember hover:text-ember transition-all group"
              >
                <span className="font-mono-custom text-[0.6rem] tracking-widest uppercase text-smoke-dim group-hover:text-ember transition-colors">{short}</span>
                <span className="text-sm text-smoke-dim group-hover:text-smoke transition-colors">{label}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── CLIENTS ───────────────────────────────────────── */}
      <section className="py-16 px-6 lg:px-12 bg-ink-2 border-t border-white/5">
        <div className="max-w-screen-xl mx-auto">
          <p className="font-mono-custom text-[0.62rem] tracking-[0.2em] uppercase text-smoke-faint/50 mb-8 text-center reveal">
            Trusted by brands worldwide
          </p>
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-4 reveal reveal-delay-1">
            {CLIENTS.map(c => (
              <span key={c} className="font-mono-custom text-[0.65rem] tracking-[0.14em] uppercase text-smoke-faint/35 hover:text-smoke-faint transition-colors">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BAND ─────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ background: '#E8452A' }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 8px)',
        }} />
        <div className="relative px-6 lg:px-12 py-20 max-w-screen-xl mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div>
            <h2 className="font-display font-light leading-tight text-ink"
              style={{ fontSize: 'clamp(2.2rem, 4vw, 3.8rem)' }}>
              Let&apos;s build video that<br /><em>pays you back.</em>
            </h2>
            <p className="text-ink/60 mt-3" style={{ fontSize: '0.95rem' }}>
              Free strategy call · Fixed-price quote · Reply in 24 hours · Zero pressure.
            </p>
          </div>
          <button
            onClick={() => openModal()}
            className="flex-shrink-0 font-mono-custom text-[0.7rem] tracking-[0.14em] uppercase px-8 py-4 cursor-pointer"
            style={{ background: '#0A0A0B', color: '#F5F4F0', border: 'none' }}>
            Get a free quote
          </button>
        </div>
      </section>
    </>
  )
}
