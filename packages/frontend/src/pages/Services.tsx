import { Link } from 'react-router-dom'
import Seo from '@/components/Seo'

const SERVICES = [
  {
    key: 'brand', slug: 'brand-video',
    icon: '▶',
    label: 'Brand & Commercial Video',
    tagline: 'Brand films that make customers choose you',
    desc: 'Brand stories, product launches, and commercial spots built to lift engagement 80% above static ads — and turn viewers into loyal buyers across every channel.',
    features: ['Brand story films', 'Product launch videos', 'Corporate culture & profiles', 'Event & campaign coverage'],
    stat: '80%',
    statLabel: 'higher engagement vs. static ads',
    color: '#E8452A',
  },
  {
    key: 'ai', slug: 'ai-video',
    icon: '◈',
    label: 'AI-Powered Video',
    tagline: '10× your content output without 10× the budget',
    desc: 'AI-augmented scripts, generative B-roll, and personalised video at scale. The same tools Fortune 500 brands use — delivering 3× higher response rates at a fraction of traditional cost.',
    features: ['AI-driven editing & post-production', 'Script & storyboard generation', 'Personalised video at scale', 'AI avatar production & explainers'],
    stat: '3×',
    statLabel: 'more response rates with AI video',
    color: '#C9A96E',
  },
  {
    key: 'product', slug: 'product-video',
    icon: '▣',
    label: 'Product & Ecommerce',
    tagline: 'Turn scrollers into buyers — in under 60 seconds',
    desc: 'Product demos, unboxing, and ecommerce spots that lift conversions up to 80%. Built for Amazon, Shopify, and paid social — with cutdowns in every aspect ratio included.',
    features: ['Product demonstration videos', 'Cooking & recipe content', 'eCommerce ad spots', 'Customer testimonial videos'],
    stat: '80%',
    statLabel: 'increase in conversions with product video',
    color: '#6C7AE0',
  },
  {
    key: 'social', slug: 'social-video',
    icon: '◉',
    label: 'Short & Social (TikTok / Reels)',
    tagline: 'Vertical content built to go viral — on purpose',
    desc: 'TikTok, Reels, and Shorts crafted for the scroll-first viewer. Trending formats, sticky hooks, and cutdown-ready exports — engineered to win the algorithm and your audience.',
    features: ['TikTok brand & product videos', 'Instagram Reels & Stories', 'YouTube Shorts', 'Promotional teasers & ad spots'],
    stat: '2B+',
    statLabel: 'monthly YouTube users reachable',
    color: '#3CBFAE',
  },
  {
    key: 'cooking', slug: 'cooking-video',
    icon: '◎',
    label: 'Cooking & Food Video',
    tagline: 'Make food impossible to scroll past',
    desc: 'Specialist cooking content that fills tables and sells products — recipe reels, restaurant promos, and food ecommerce spots. Styling, props, and lighting all handled in-house.',
    features: ['Recipe & tutorial videos', 'Restaurant & brand promos', 'Social media food content', 'eCommerce food product videos'],
    stat: '12M+',
    statLabel: 'views on client cooking content',
    color: '#E87A2A',
  },
  {
    key: 'post', slug: 'post-production',
    icon: '◫',
    label: 'Post Production',
    tagline: 'Send us the footage. Get back content that performs.',
    desc: 'Edit, colour, motion, sound, and VFX — all in-house, all broadcast-quality. Works with footage from any crew, any camera. 48-hour rush delivery when you need it yesterday.',
    features: ['Advanced editing & assembly', 'Expert colour grading & HDR', 'Motion graphics & 3D animation', 'Sound design & music licensing'],
    stat: '48h',
    statLabel: 'turnaround available',
    color: '#E87A2A',
  },
  {
    key: 'elearning', slug: 'elearning-video',
    icon: '◰',
    label: 'eLearning & Corporate Training',
    tagline: 'Training your team will actually finish',
    desc: 'eLearning video with 9× better retention than text. Scripting, presenter filming, animation, and SCORM-ready delivery — a complete module ready for your LMS in weeks.',
    features: ['Lecture & tutorial videos', 'Screen-recorded walkthroughs', 'Animated explainers', 'Corporate onboarding content'],
    stat: '80%',
    statLabel: 'of companies need training video',
    color: '#C9A96E',
  },
  {
    key: 'fashion', slug: 'fashion-video',
    icon: '◇',
    label: 'Fashion & Lifestyle Video',
    tagline: 'Lookbooks that drive 4× higher purchase intent',
    desc: 'Cinematic fashion film for brands that lead. Lookbooks, campaigns, and social content — with full casting, wardrobe, and location production handled by a team that speaks fashion.',
    features: ['Lookbook & collection films', 'Product demonstration videos', 'Social media fashion content', 'Brand story & campaign videos'],
    stat: '4×',
    statLabel: 'higher purchase intent from fashion video',
    color: '#FF5A3D',
  },
  {
    key: 'testimonial', slug: 'testimonial-video',
    icon: '◐',
    label: 'Testimonial & Review Videos',
    tagline: 'Let your best customers sell for you',
    desc: 'Authentic testimonial films and case studies that turn hesitant prospects into confident buyers. Pre-interview prep, remote or on-location filming, and distribution strategy — all handled.',
    features: ['Customer testimonial films', 'Case study videos', 'Short-form social testimonials', 'Strategic placement & distribution'],
    stat: '92%',
    statLabel: 'of buyers trust peer recommendations',
    color: '#C9A96E',
  },
]

const PROCESS = [
  { n: '01', title: 'Discovery & Strategy', desc: 'We immerse in your brand, audience, and goals. Every project starts with a creative brief that aligns vision with measurable business outcomes.' },
  { n: '02', title: 'Pre-Production', desc: 'Scripting, storyboarding, casting, location scouting, and shot-by-shot planning. Nothing left to chance on shoot day.' },
  { n: '03', title: 'Production', desc: 'On-location or studio shoot with our full crew, professional lighting, broadcast audio, and direction by our senior team.' },
  { n: '04', title: 'Post & Delivery', desc: 'Edit, colour grade, motion graphics, sound design. Delivered in every format you need — with revision rounds included and 48h turnaround available.' },
]

export default function Services() {
  return (
    <>
      <Seo
        title="Video Production Services — Brand Film to AI Campaigns"
        description="Brand films, AI-powered campaigns, product videos, social content, drone cinematography, post production, and eLearning — end-to-end video for every format."
        canonicalPath="/services"
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          'name': 'Imba Production Video Services',
          'url': 'https://imbaproduction.com/services',
          'itemListElement': [
            { '@type': 'ListItem', 'position': 1, 'name': 'Brand Video', 'url': 'https://imbaproduction.com/services/brand-video' },
            { '@type': 'ListItem', 'position': 2, 'name': 'AI Video', 'url': 'https://imbaproduction.com/services/ai-video' },
            { '@type': 'ListItem', 'position': 3, 'name': 'Product Video', 'url': 'https://imbaproduction.com/services/product-video' },
            { '@type': 'ListItem', 'position': 4, 'name': 'Social Video', 'url': 'https://imbaproduction.com/services/social-video' },
            { '@type': 'ListItem', 'position': 5, 'name': 'Post Production', 'url': 'https://imbaproduction.com/services/post-production' },
            { '@type': 'ListItem', 'position': 6, 'name': 'Drone & Aerial', 'url': 'https://imbaproduction.com/services/drone-video' },
            { '@type': 'ListItem', 'position': 7, 'name': 'eLearning Video', 'url': 'https://imbaproduction.com/services/elearning-video' },
          ],
        }}
      />
      {/* ── PAGE HERO ─────────────────────────────────────── */}
      <section className="pt-36 pb-20 px-6 lg:px-12 bg-ink relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }} />
        <div className="absolute bottom-0 right-0 w-[50vw] h-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 60% at 100% 100%, rgba(201,169,110,0.06) 0%, transparent 65%)' }}
        />
        <div className="relative max-w-screen-xl mx-auto">
          <p className="eyebrow mb-5 reveal">Built for business results</p>
          <div className="grid lg:grid-cols-2 gap-12 items-end">
            <div>
              <h1 className="font-display font-light leading-tight mb-6 reveal reveal-delay-1"
                style={{ fontSize: 'clamp(3rem, 6vw, 5.5rem)' }}>
                One partner.<br />
                <em className="text-gold italic">Every format.</em>
              </h1>
              <p className="text-smoke-dim leading-relaxed max-w-md reveal reveal-delay-2" style={{ fontSize: '0.95rem' }}>
                From brand films to AI campaigns, product videos to aerial cinematography — every format your marketing needs, produced by one team that actually knows your business.
              </p>
            </div>
            <div className="hidden lg:flex flex-col gap-3 reveal reveal-delay-2">
              <div className="bg-ink-2 border border-white/5 p-6">
                <p className="font-mono-custom text-[0.62rem] tracking-[0.18em] uppercase text-smoke-faint mb-3">Why video works</p>
                {[
                  { stat: '80%', label: 'increase in conversions with product video' },
                  { stat: '92%', label: 'of buyers trust peer recommendations on video' },
                  { stat: '2/3', label: 'of shoppers say video influenced a purchase' },
                ].map(({ stat, label }) => (
                  <div key={stat} className="flex items-center gap-4 py-2.5 border-b border-white/5 last:border-0">
                    <span className="font-display font-light text-2xl text-ember w-12 flex-shrink-0">{stat}</span>
                    <span className="font-mono-custom text-[0.62rem] text-smoke-dim tracking-wide">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SERVICES GRID ─────────────────────────────────── */}
      <section className="bg-ink-2 py-20 px-6 lg:px-12" id="all-services">
        <div className="max-w-screen-xl mx-auto">
          <p className="eyebrow mb-12 reveal">All services</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5">
            {SERVICES.map(({ key, slug, icon, label, tagline, desc, features, stat, statLabel, color }, i) => (
              <div
                key={key}
                className="bg-ink-2 p-8 relative overflow-hidden transition-colors duration-300 hover:bg-ink-3 reveal flex flex-col"
                style={{ transitionDelay: `${i * 40}ms` }}
              >
                {/* Ghost number */}
                <span className="absolute top-4 right-5 font-display text-[4.5rem] font-light leading-none select-none"
                  style={{ color: 'rgba(255,255,255,0.03)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>

                {/* Icon */}
                <div className="w-10 h-10 border flex items-center justify-center mb-6 text-lg"
                  style={{ borderColor: `${color}40`, color }}>
                  {icon}
                </div>

                <h3 className="font-display font-light text-smoke text-xl mb-1.5">{label}</h3>
                <p className="font-mono-custom text-[0.6rem] tracking-[0.14em] uppercase mb-4" style={{ color }}>{tagline}</p>
                <p className="text-sm text-smoke-dim leading-relaxed mb-5">{desc}</p>

                {/* Features */}
                <ul className="space-y-1.5 mb-6 flex-1">
                  {features.map(f => (
                    <li key={f} className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="font-mono-custom text-[0.62rem] text-smoke-dim tracking-wide">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* Stat + Learn more */}
                <div className="pt-5 border-t border-white/5">
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="font-display font-light text-2xl" style={{ color }}>{stat}</span>
                    <span className="font-mono-custom text-[0.58rem] text-smoke-faint tracking-wide">{statLabel}</span>
                  </div>
                  <Link
                    to={`/services/${slug}`}
                    className="font-mono-custom text-[0.62rem] tracking-[0.14em] uppercase flex items-center gap-2 transition-colors duration-200 hover:gap-3"
                    style={{ color }}
                  >
                    <span>Learn more</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROCESS ───────────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12 bg-ink">
        <div className="max-w-screen-xl mx-auto grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <p className="eyebrow mb-4 reveal">How we work</p>
            <h2 className="font-display font-light leading-tight mb-12 reveal reveal-delay-1"
              style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}>
              From brief to<br /><em className="text-gold italic">final cut</em>
            </h2>
            {PROCESS.map(({ n, title, desc }, i) => (
              <div key={n}
                className="flex gap-5 py-6 border-b border-white/5 group hover:pl-3 transition-all duration-300 reveal"
                style={{ transitionDelay: `${i * 80}ms` }}>
                <span className="font-mono-custom text-[0.7rem] text-ember opacity-70 mt-1 min-w-[2rem]">{n}</span>
                <div>
                  <h3 className="font-display text-xl text-smoke mb-1.5 group-hover:text-ember transition-colors">{title}</h3>
                  <p className="text-sm text-smoke-dim leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Why choose panel */}
          <div className="reveal reveal-delay-2 lg:pt-20">
            <div className="bg-ink-2 border border-white/5 p-8">
              <p className="font-mono-custom text-[0.62rem] tracking-[0.18em] uppercase text-smoke-faint mb-6">Why teams choose Imba</p>
              {[
                { title: 'Every video earns its budget', desc: 'We start from your KPIs — more leads, higher conversions, stronger recall — and work backwards. If it won\'t move the number, we won\'t shoot it.' },
                { title: 'Broadcast quality, startup pricing', desc: 'The same cameras, lighting, and sound you see in major campaigns — at a fraction of what an agency would charge. Fixed price, zero hidden costs.' },
                { title: 'AI cuts weeks off every project', desc: 'Our AI-augmented pipeline ships faster, tests more variants, and doubles down on what converts — so you get more performing content, sooner.' },
                { title: '48h delivery, worldwide', desc: 'Producing on-location across Europe and the US, delivering fully remote. Need it live this week? 48-hour rush turnarounds are standard.' },
              ].map(({ title, desc }, i) => (
                <div key={title}
                  className="flex gap-4 py-5 border-b border-white/5 last:border-0"
                  style={{ transitionDelay: `${i * 60}ms` }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-ember mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-smoke font-medium text-sm mb-1">{title}</p>
                    <p className="text-smoke-dim text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── WHITE LABEL STRIP ─────────────────────────────── */}
      <section className="bg-ink-2 border-t border-white/5 py-16 px-6 lg:px-12">
        <div className="max-w-screen-xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="max-w-lg">
            <p className="eyebrow mb-3">For agencies & resellers</p>
            <h2 className="font-display font-light text-smoke leading-tight" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)' }}>
              Expand your offering — <em className="text-gold italic">under your brand</em>
            </h2>
            <p className="text-smoke-dim mt-3" style={{ fontSize: '0.9rem' }}>
              Sell every video service we offer as your own. No gear to buy, no crew to hire, no delivery to manage — just one trusted partner behind your agency brand.
            </p>
          </div>
          <Link to="/contact" className="btn btn-primary flex-shrink-0">Enquire about white label</Link>
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
              Stop describing your product.<br /><em>Start selling it.</em>
            </h2>
            <p className="text-ink/60 mt-3" style={{ fontSize: '0.95rem' }}>
              Free strategy call · Fixed-price quote · 24-hour reply · Zero pressure.
            </p>
          </div>
          <Link to="/contact"
            className="flex-shrink-0 font-mono-custom text-[0.7rem] tracking-[0.14em] uppercase px-8 py-4"
            style={{ background: '#0A0A0B', color: '#F5F4F0' }}>
            Get a free quote
          </Link>
        </div>
      </section>
    </>
  )
}
