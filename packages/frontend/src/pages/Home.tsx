import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { PortfolioItem, Testimonial, HeroVideo } from '@/lib/supabase'
import Seo from '@/components/Seo'

// ── Static fallback data ──────────────────────────

const DEMO_PORTFOLIO: PortfolioItem[] = [
  { id:'1', title:'Cooking Heritage Campaign', slug:'cooking', category:'brand', client_name:'FoodCo', featured:true, published:true, sort_order:0, created_at:'', description:'', youtube_id:'rzfWrv3ERxk', results:{ views:'4.2M', ctr:'↑38%' } },
  { id:'2', title:'Gen AI Campaign', slug:'fashion', category:'ai', client_name:'NordShop', featured:false, published:true, sort_order:1, created_at:'', description:'', youtube_id:'9k5w1iG_JHM' },
  { id:'3', title:'Aerial Cinematography', slug:'drone', category:'drone', client_name:'Prime Real Estate', featured:false, published:true, sort_order:2, created_at:'', description:'', youtube_id:'_fbHbplDCwo' },
  { id:'4', title:'Creature VFX Reel', slug:'ecomm', category:'post', client_name:'Velour Boutique', featured:false, published:true, sort_order:3, created_at:'', description:'', youtube_id:'EZUJiL9MeLw' },
  { id:'5', title:'Brand Film', slug:'social', category:'brand', client_name:'BrandX', featured:false, published:true, sort_order:4, created_at:'', description:'', youtube_id:'HAHj0TDQZcg', results:{ views:'12M' } },
]

const DEMO_TESTIMONIALS: Testimonial[] = [
  { id:'1', client_name:'Sarah Andersen', client_role:'CMO', client_company:'FoodCo International', text:'Imba transformed how we present our brand. The cooking series generated 3× more traffic than any previous content.', featured:true, published:true },
  { id:'2', client_name:'Marco Kessler', client_role:'Growth Lead', client_company:'NordShop', text:'The AI video campaign was something we had never seen. Personalisation at scale reduced our cost-per-acquisition by 40%.', featured:false, published:true },
  { id:'3', client_name:'Julia Larsson', client_role:'Founder', client_company:'Velour Boutique', text:'Professional, fast, genuinely creative. Full product video suite in 48 hours. The team is exceptional.', featured:false, published:true },
]

const SERVICES = [
  { key:'brand', icon:'▶', label:'Brand & Commercial', desc:'Brand films that lift engagement 80% above static ads — and turn viewers into buyers.' },
  { key:'ai', icon:'◈', label:'AI-Powered Video', desc:'10× your content output without 10× the budget. Personalised campaigns that deliver 3× higher response rates.' },
  { key:'product', icon:'▣', label:'Product & Ecommerce', desc:'Product videos that stop the scroll and lift conversions by up to 80% on Amazon, Shopify, and social.' },
  { key:'social', icon:'◉', label:'Short & Social', desc:'Vertical content built to go viral — on purpose. Native TikTok, Reels, and Shorts that audiences share.' },
  { key:'post', icon:'◫', label:'Post Production', desc:'Send us the footage. Get back content that performs — edit, grade, motion, sound, and VFX in-house.' },
  { key:'drone', icon:'◬', label:'Drone & Aerial', desc:'Licensed aerial cinematography that gives your brand a perspective competitors simply can\'t match.' },
]

const STATS = [
  { num: '12', sup:'+', label:'Years driving results' },
  { num: '500', sup:'+', label:'Brands served' },
  { num: '48', sup:'h', label:'Rush delivery' },
  { num: '98', sup:'%', label:'Client satisfaction' },
]

const DEMO_HERO_VIDEOS: HeroVideo[] = [
  { id: '1', youtube_id: 'HAHj0TDQZcg', title: 'A Steampunk Princess',  sort_order: 0, active: true, created_at: '', slide_eyebrow: 'Brand films that move markets',   slide_headline: 'Stories audiences',           slide_headline_em: 'can\'t scroll past.',    slide_subheadline: 'Cinematic brand video built to drive recall, revenue, and referrals — delivered in weeks, not months.' },
  { id: '2', youtube_id: 'SgHHbWp64cE', title: 'Virus House Teaser',    sort_order: 1, active: true, created_at: '', slide_eyebrow: 'Brand & Commercial',   slide_headline: 'Brand films that make',   slide_headline_em: 'customers choose you.',            slide_subheadline: 'Lift engagement 80% above static ads with cinematic films built around your business goals.' },
  { id: '3', youtube_id: '9k5w1iG_JHM', title: 'Gen AI Video',          sort_order: 2, active: true, created_at: '', slide_eyebrow: 'AI-Powered Video',  slide_headline: '10× your content output',     slide_headline_em: 'without 10× the budget.',         slide_subheadline: 'AI-augmented campaigns that personalise at scale and deliver 3× higher response rates than static outreach.' },
  { id: '4', youtube_id: '_fbHbplDCwo', title: 'Yoga on the Lake',       sort_order: 3, active: true, created_at: '', slide_eyebrow: 'Drone & Aerial',       slide_headline: 'Give your brand', slide_headline_em: 'the view competitors lack.',       slide_subheadline: 'Licensed 4K aerial cinematography for brands that refuse to blend in — from real estate to global campaigns.' },
  { id: '5', youtube_id: 'EZUJiL9MeLw', title: 'The Creature Transformation', sort_order: 4, active: true, created_at: '', slide_eyebrow: 'Post Production & VFX', slide_headline: 'Send us the footage.', slide_headline_em: 'Get back content that performs.',      slide_subheadline: 'Full in-house edit, colour, motion, sound, and VFX — broadcast-quality delivered in as little as 48 hours.' },
]

// ── Category accent colors ──
const CAT_COLOR: Record<string, string> = {
  brand: '#E8452A',
  ai: '#C9A96E',
  product: '#6C7AE0',
  social: '#3CBFAE',
  drone: '#8A8AFF',
  post: '#E87A2A',
}

export default function Home() {
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(DEMO_PORTFOLIO)
  const [testimonials, setTestimonials] = useState<Testimonial[]>(DEMO_TESTIMONIALS)
  const [heroVideos, setHeroVideos] = useState<HeroVideo[]>(DEMO_HERO_VIDEOS)
  const [currentVideo, setCurrentVideo] = useState(0)
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [playingVideo, setPlayingVideo] = useState(false)

  useEffect(() => {
    // Prefer homepage_featured items, fall back to sort_order
    supabase.from('portfolio_items').select('*').eq('published', true).eq('homepage_featured', true).order('sort_order')
      .then(({ data: featured }) => {
        if (featured?.length) {
          setPortfolio(featured)
        } else {
          supabase.from('portfolio_items').select('*').eq('published', true).order('sort_order').limit(5)
            .then(({ data }) => { if (data?.length) setPortfolio(data) })
        }
      })
    supabase.from('testimonials').select('*').eq('published', true)
      .then(({ data }) => { if (data?.length) setTestimonials(data) })
    supabase.from('hero_videos').select('*').eq('active', true).order('sort_order')
      .then(({ data }) => { if (data?.length) setHeroVideos(data) })
  }, [])

  // Auto-advance slider — pauses while a video is playing
  useEffect(() => {
    if (heroVideos.length <= 1 || playingVideo) return
    const timer = setInterval(() => {
      setCurrentVideo(i => (i + 1) % heroVideos.length)
    }, 10000)
    return () => clearInterval(timer)
  }, [heroVideos.length, playingVideo])

  function goToSlide(i: number) {
    setCurrentVideo(i)
    setPlayingVideo(false)
  }

  return (
    <>
      <Seo
        title="Next-Gen Video Production for Brands"
        description="Cinematic video production powered by AI strategy. Brand films, product videos, AI campaigns, drone, and social content — concept to distribution."
        canonicalPath="/"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            'name': 'Imba Production',
            'url': 'https://imbaproduction.com',
            'potentialAction': {
              '@type': 'SearchAction',
              'target': { '@type': 'EntryPoint', 'urlTemplate': 'https://imbaproduction.com/work?q={search_term_string}' },
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            'name': 'Imba Production',
            'url': 'https://imbaproduction.com',
            'logo': 'https://imbaproduction.com/og-default.jpg',
            'description': 'Next-generation video production company powered by cinematic craft and AI strategy.',
            'address': {
              '@type': 'PostalAddress',
              'streetAddress': '007 N Orange St, 4th Floor, Suite #3601',
              'addressLocality': 'Wilmington',
              'addressRegion': 'DE',
              'postalCode': '19801',
              'addressCountry': 'US',
            },
            'contactPoint': {
              '@type': 'ContactPoint',
              'email': 'hello@imbaproduction.com',
              'contactType': 'customer service',
            },
            'sameAs': [
              'https://www.instagram.com/imbaproduction',
              'https://www.youtube.com/channel/UCV4zBHquBoo4NLw0tMi2ZKQ',
              'https://www.tiktok.com/@imbaproduction',
              'https://www.linkedin.com/company/imba-production',
              'https://twitter.com/productionimba',
            ],
          },
        ]}
      />
      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col justify-end overflow-hidden">

        {/* Slide backgrounds */}
        {heroVideos.map((video, i) => (
          <div
            key={video.id}
            className="absolute inset-0 overflow-hidden"
            style={{ opacity: i === currentVideo ? 1 : 0, transition: 'opacity 1.4s ease', zIndex: 0 }}
          >
            {/* Thumbnail — always shown; hidden by iframe once user hits play */}
            <img
              src={`https://img.youtube.com/vi/${video.youtube_id}/maxresdefault.jpg`}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: i === currentVideo && playingVideo ? 0 : 1, transition: 'opacity 0.5s ease' }}
              onError={e => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg` }}
            />
            {/* iframe rendered only when user explicitly plays this slide */}
            {i === currentVideo && playingVideo && (
              <iframe
                key={`${video.youtube_id}-play`}
                src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1&mute=0&loop=1&playlist=${video.youtube_id}&controls=1&rel=0&iv_load_policy=3&modestbranding=1`}
                style={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 'max(100%, calc(100vh * 1.7778))',
                  height: 'max(100%, calc(100vw * 0.5625))',
                  border: 'none',
                }}
                allow="autoplay; encrypted-media; fullscreen"
              />
            )}
          </div>
        ))}

        {/* Stop video button — shown when playing */}
        {playingVideo && (
          <button
            onClick={() => setPlayingVideo(false)}
            aria-label="Stop video"
            className="absolute flex items-center justify-center"
            style={{
              zIndex: 25, top: '24px', right: '24px',
              width: '40px', height: '40px',
              background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%', cursor: 'pointer', color: '#F5F4F0',
              fontSize: '18px', lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}

        {/* Gradient overlays */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(to right, rgba(10,10,11,0.9) 0%, rgba(10,10,11,0.55) 55%, rgba(10,10,11,0.25) 100%)',
          zIndex: 1,
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(to top, rgba(10,10,11,0.97) 0%, rgba(10,10,11,0.45) 35%, transparent 65%)',
          zIndex: 1,
        }} />

        {/* Ember glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 50% 55% at 12% 82%, rgba(232,69,42,0.18) 0%, transparent 55%)',
          zIndex: 2,
        }} />

        {/* Scanlines */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 1px, transparent 1px, transparent 3px)',
          zIndex: 2,
        }} />

        {/* Per-slide hero text — fades + slides in with each video */}
        {heroVideos.map((video, i) => (
          <div
            key={video.id}
            className="absolute inset-x-0 bottom-0 px-6 lg:px-12 pb-28 pt-36"
            style={{
              opacity: i === currentVideo ? 1 : 0,
              transform: i === currentVideo ? 'translateY(0)' : 'translateY(14px)',
              transition: 'opacity 0.75s ease, transform 0.75s ease',
              transitionDelay: i === currentVideo ? '0.55s' : '0s',
              zIndex: 10,
              pointerEvents: i === currentVideo ? 'auto' : 'none',
            }}
          >
            <p className="eyebrow mb-5">{video.slide_eyebrow || 'Next-generation video production · Est. 2012'}</p>

            <h1 className="font-display font-light leading-none mb-6"
              style={{ fontSize: 'clamp(3.2rem, 7vw, 6.8rem)' }}>
              {video.slide_headline || 'Stories that move'}<br />
              <em className="text-gold italic">{video.slide_headline_em || 'people to act.'}</em>
            </h1>

            <p className="text-smoke-dim leading-relaxed max-w-sm mb-10" style={{ fontSize: '0.95rem' }}>
              {video.slide_subheadline || 'We combine cinematic craft with AI-powered strategy to produce brand videos that captivate, convert, and endure.'}
            </p>

            <div className="flex items-center gap-6">
              <Link to="/work" className="btn btn-primary">See our work</Link>
              <Link to="/services" className="btn btn-ghost flex items-center gap-2">
                <span>Explore services</span><span>→</span>
              </Link>
            </div>
          </div>
        ))}

        {/* Slide indicators */}
        {heroVideos.length > 1 && (
          <div className="absolute bottom-8 left-6 lg:left-12 flex items-center gap-3" style={{ zIndex: 20 }}>
            {heroVideos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => goToSlide(i)}
                aria-label={v.title}
                style={{
                  height: '2px',
                  width: i === currentVideo ? '32px' : '12px',
                  background: i === currentVideo ? '#E8452A' : 'rgba(255,255,255,0.25)',
                  transition: 'all 0.4s ease',
                  border: 'none', cursor: 'pointer', padding: 0,
                }}
              />
            ))}
            <span className="font-mono-custom text-[0.55rem] tracking-[0.2em] uppercase text-smoke-faint/50 ml-1">
              {heroVideos[currentVideo]?.slide_eyebrow || heroVideos[currentVideo]?.title}
            </span>
          </div>
        )}

        {/* Scroll indicator */}
        <div className="absolute bottom-8 right-12 hidden lg:flex flex-col items-center gap-3" style={{ zIndex: 20 }}>
          <div className="w-px h-12 bg-gradient-to-b from-transparent to-white/20" />
          <span className="font-mono-custom text-[0.55rem] tracking-[0.25em] text-smoke-faint/40 uppercase" style={{ writingMode: 'vertical-rl' }}>Scroll</span>
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────────── */}
      <div className="border-y border-white/6 grid grid-cols-2 lg:grid-cols-4">
        {STATS.map(({ num, sup, label }, i) => (
          <div key={label} className={`hud-card px-8 lg:px-12 py-8 ${i < 3 ? 'border-r border-white/6' : ''}`}>
            <div className="stat-num font-display font-light leading-none" style={{ fontSize: '3rem' }}>
              {num}<em className="not-italic" style={{ color: '#E8452A' }}>{sup}</em>
            </div>
            <div className="font-mono-custom text-[0.6rem] tracking-[0.18em] uppercase text-smoke-faint mt-2">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ── SERVICES ───────────────────────────────────────── */}
      <section className="bg-ink-2 py-24 px-6 lg:px-12" id="services">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-16 gap-6">
            <div>
              <p className="eyebrow mb-4 reveal">Built around your goals</p>
              <h2 className="font-display font-light leading-tight reveal reveal-delay-1"
                style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}
              >
                One partner for every<br /><em className="text-gold">channel you sell on</em>
              </h2>
            </div>
            <Link to="/services" className="btn btn-ghost reveal">
              All services →
            </Link>
          </div>

          <div className="services-grid border border-white/5">
            {SERVICES.map(({ key, icon, label, desc }, i) => (
              <div
                key={key}
                className="hud-card holo-shimmer bg-ink-2 p-8 relative overflow-hidden transition-all duration-300 hover:bg-ink-3 cursor-pointer reveal group"
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                {/* Ghost number */}
                <span className="absolute top-4 right-5 font-display text-[4.5rem] font-light leading-none select-none"
                  style={{ color: 'rgba(255,255,255,0.03)' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                {/* Icon */}
                <div className="w-10 h-10 border flex items-center justify-center mb-6 text-lg transition-all duration-300 group-hover:shadow-[0_0_12px_rgba(0,212,255,0.2)]"
                  style={{ borderColor: 'rgba(232,69,42,0.25)', color: CAT_COLOR[key] }}
                >
                  {icon}
                </div>
                <h3 className="font-display font-light text-smoke text-xl mb-3">{label}</h3>
                <p className="text-sm text-smoke-dim leading-relaxed">{desc}</p>
                <div className="flex items-center gap-2 mt-6 font-mono-custom text-[0.62rem] tracking-[0.14em] uppercase text-ember group-hover:text-cyber transition-colors duration-300">
                  <span>Explore</span>
                  <span>→</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PORTFOLIO ──────────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12" id="work">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-end justify-between mb-12">
            <div>
              <p className="eyebrow mb-4 reveal">Selected work</p>
              <h2 className="font-display font-light leading-tight reveal reveal-delay-1"
                style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}
              >
                Our <em className="text-gold">latest</em> productions
              </h2>
            </div>
            <Link to="/work" className="btn btn-ghost hidden lg:flex reveal">
              View all work →
            </Link>
          </div>

          <div className="portfolio-mosaic reveal">
            {portfolio.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="relative overflow-hidden cursor-film group bg-ink-3"
                onMouseEnter={() => setHoveredCard(item.id)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                {/* YouTube thumbnail or solid color background */}
                {item.youtube_id ? (
                  <img
                    src={`https://img.youtube.com/vi/${item.youtube_id}/maxresdefault.jpg`}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    onError={e => { (e.currentTarget as HTMLImageElement).src = `https://img.youtube.com/vi/${item.youtube_id}/hqdefault.jpg` }}
                  />
                ) : item.thumbnail_url ? (
                  <img src={item.thumbnail_url} alt={item.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : null}
                {/* Dark overlay on thumbnail */}
                <div className="absolute inset-0 bg-ink/50 group-hover:bg-ink/30 transition-colors duration-500" />
                {/* Colored accent per category */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `radial-gradient(ellipse 60% 60% at 30% 70%, ${CAT_COLOR[item.category] || '#E8452A'}14 0%, transparent 70%)` }}
                />
                {/* Scanlines */}
                <div className="absolute inset-0 opacity-20"
                  style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)' }}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                {/* Corner marks on hover */}
                <div className={`absolute inset-3 transition-opacity duration-300 ${hoveredCard === item.id ? 'opacity-100' : 'opacity-0'} pointer-events-none`}>
                  {/* TL */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-ember/60" />
                  {/* TR */}
                  <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-ember/60" />
                  {/* BL */}
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-ember/60" />
                  {/* BR */}
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-ember/60" />
                </div>

                {/* Play circle */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`w-14 h-14 border border-white/20 rounded-full flex items-center justify-center transition-all duration-400 ${hoveredCard === item.id ? 'scale-110 border-ember/50' : 'scale-90 opacity-0'}`}>
                    <div style={{ borderLeft: '14px solid rgba(255,255,255,0.8)', borderTop: '8px solid transparent', borderBottom: '8px solid transparent', marginLeft: '3px' }} />
                  </div>
                </div>

                {/* Meta */}
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <div className="font-mono-custom text-[0.58rem] tracking-[0.18em] uppercase mb-1.5"
                    style={{ color: CAT_COLOR[item.category] || '#E8452A' }}
                  >
                    {item.category} · {item.client_name}
                  </div>
                  <div className="font-display font-light text-smoke text-xl leading-tight">
                    {item.title}
                  </div>
                  {item.results && (
                    <div className="flex gap-4 mt-2">
                      {Object.entries(item.results).map(([k, v]) => (
                        <span key={k} className="font-mono-custom text-[0.58rem] text-smoke-faint tracking-wider">
                          {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Category top-right badge */}
                <div className="absolute top-4 right-4 font-mono-custom text-[0.55rem] tracking-widest uppercase px-2 py-1"
                  style={{ background: `${CAT_COLOR[item.category] || '#E8452A'}22`, color: CAT_COLOR[item.category] || '#E8452A', border: `1px solid ${CAT_COLOR[item.category] || '#E8452A'}33` }}
                >
                  {item.category}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROCESS ────────────────────────────────────────── */}
      <section className="bg-ink-2 py-24 px-6 lg:px-12" id="process">
        <div className="max-w-screen-xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="eyebrow mb-4 reveal">How we work</p>
            <h2 className="font-display font-light leading-tight mb-12 reveal reveal-delay-1"
              style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}
            >
              From brief to<br /><em className="text-gold">final cut</em>
            </h2>
            {[
              { n:'01', title:'Discovery & Strategy', desc:'We immerse in your brand, audience, and goals. Every production starts with a creative brief that aligns vision with measurable outcomes.' },
              { n:'02', title:'Pre-production', desc:'Scripting, storyboarding, casting, location scouting, and shot-by-shot planning. Nothing left to chance on shoot day.' },
              { n:'03', title:'Production', desc:'On-location or studio shoot with full crew, lighting, audio, and direction by our senior team.' },
              { n:'04', title:'Post & Delivery', desc:'Edit, grade, motion graphics, sound design. Delivered in every format you need, with revision rounds included.' },
            ].map(({ n, title, desc }, i) => (
              <div key={n}
                className="flex gap-5 py-6 border-b border-white/5 group hover:pl-3 transition-all duration-300 reveal"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <span className="font-mono-custom text-[0.7rem] text-ember opacity-70 mt-1 min-w-[2rem]">{n}</span>
                <div>
                  <h3 className="font-display text-xl text-smoke mb-1.5 group-hover:text-ember transition-colors">{title}</h3>
                  <p className="text-sm text-smoke-dim leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Visual panel — film metaphor */}
          <div className="relative aspect-[3/4] bg-ink-3 border border-white/5 overflow-hidden reveal reveal-delay-2">
            {/* Vertical film strip */}
            <div className="absolute left-6 top-0 bottom-0 flex flex-col gap-2 py-4 w-8">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="flex-1 border border-white/6 bg-ink-4" />
              ))}
            </div>
            <div className="absolute right-6 top-0 bottom-0 flex flex-col gap-2 py-4 w-8">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="flex-1 border border-white/6 bg-ink-4" />
              ))}
            </div>
            {/* Center content */}
            <div className="absolute inset-16 flex flex-col justify-center items-center text-center gap-8">
              <div className="w-16 h-16 border border-ember/20 rounded-full flex items-center justify-center">
                <div style={{ borderLeft: '18px solid rgba(232,69,42,0.5)', borderTop: '11px solid transparent', borderBottom: '11px solid transparent', marginLeft: '4px' }} />
              </div>
              <div>
                <p className="font-mono-custom text-[0.6rem] tracking-[0.2em] uppercase text-smoke-faint mb-2">Behind the scenes</p>
                <p className="font-display font-light text-smoke/50" style={{ fontSize: '1.1rem' }}>
                  Your brand story,<br />frame by frame
                </p>
              </div>
            </div>
            {/* Ember glow */}
            <div className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(232,69,42,0.06) 0%, transparent 70%)' }}
            />
          </div>
        </div>
      </section>

      {/* ── AI SECTION ─────────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12" id="ai">
        <div className="max-w-screen-xl mx-auto grid lg:grid-cols-2 gap-16 items-start">
          {/* Code terminal visual */}
          <div className="bg-ink-2 border border-white/5 overflow-hidden reveal">
            {/* Terminal bar */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
              <div className="w-2.5 h-2.5 rounded-full bg-ember/40" />
              <div className="w-2.5 h-2.5 rounded-full bg-gold/30" />
              <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
              <span className="font-mono-custom text-[0.58rem] tracking-widest text-smoke-faint ml-3 uppercase">
                imba_ai_engine.log
              </span>
            </div>
            <div className="p-6 font-mono-custom text-[0.72rem] leading-[2.1] text-smoke-faint/60">
              <span className="text-ember/80">$</span> run analysis --input showreel_draft.mp4<br />
              <span className="text-smoke-faint/30">→</span> frames_analyzed: <span className="text-gold">1,847</span><br />
              <span className="text-smoke-faint/30">→</span> faces_detected: <span className="text-smoke/70">3</span><br />
              <span className="text-smoke-faint/30">→</span> emotion_map:<br />
              <span className="text-smoke-faint/30 ml-4">joy:</span> <span className="text-gold">0.87</span><br />
              <span className="text-smoke-faint/30 ml-4">surprise:</span> <span className="text-gold">0.71</span><br />
              <span className="text-smoke-faint/30">→</span> pacing_score: <span className="text-ember">94 / 100</span><br />
              <span className="text-smoke-faint/30">→</span> suggested_cuts: <span className="text-smoke/70">14</span><br />
              <br />
              <span className="text-ember/80">$</span> generate variants --cta-test<br />
              <span className="text-smoke-faint/30">→</span> variant_a: hook_3s — CTR: <span className="text-gold">+32%</span><br />
              <span className="text-smoke-faint/30">→</span> variant_b: long_form — Conv: <span className="text-gold">+18%</span><br />
              <span className="text-smoke-faint/30">→</span> winner: <span className="text-ember">variant_a</span> <span className="blink text-ember">_</span>
            </div>
          </div>

          {/* Text */}
          <div>
            <p className="eyebrow mb-4 reveal">AI, working for you</p>
            <h2 className="font-display font-light leading-tight mb-8 reveal reveal-delay-1"
              style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}
            >
              Ship more video.<br /><em className="text-gold">Spend less doing it.</em>
            </h2>
            <div className="flex flex-col gap-4">
              {[
                { t:'From brief to script in minutes', d:'Explore 20+ creative directions in an afternoon — and lock the winning concept before competitors finish planning.' },
                { t:'Personalise at scale, not by hand', d:'One shoot becomes thousands of personalised variants for email, paid, and social. Same budget, 10× the reach.' },
                { t:'Only ship what converts', d:'We A/B test cut variants against your KPIs and ship the winners — not just what looks good in the review.' },
                { t:'Visuals cameras can\'t capture', d:'Runway, Sora, and Stable Diffusion plugged into our pipeline for scenes that were impossible — or unaffordable — last year.' },
              ].map(({ t, d }, i) => (
                <div key={t} className="flex gap-4 p-4 border border-white/4 hover:border-ember/20 hover:bg-ember/2 transition-all reveal"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-ember mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-smoke font-medium text-sm mb-1">{t}</p>
                    <p className="text-smoke-dim text-sm leading-relaxed">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────────────── */}
      <section className="bg-ink-2 py-24 px-6 lg:px-12">
        <div className="max-w-screen-xl mx-auto">
          <p className="eyebrow mb-4 reveal">Client voice</p>
          <h2 className="font-display font-light leading-tight mb-14 reveal reveal-delay-1"
            style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)' }}
          >
            What our clients <em className="text-gold">say</em>
          </h2>
          <div className="grid md:grid-cols-3 gap-px bg-white/5">
            {testimonials.map((t, i) => (
              <div key={t.id} className="bg-ink-2 p-8 relative reveal" style={{ transitionDelay: `${i * 100}ms` }}>
                {/* Decorative quote mark */}
                <div className="absolute top-5 right-6 font-display text-[6rem] font-light leading-none select-none"
                  style={{ color: 'rgba(232,69,42,0.05)' }}
                >"</div>
                <p className="font-display text-lg font-light italic text-smoke/80 leading-relaxed mb-6">
                  {t.text}
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-mono-custom text-[0.6rem]"
                    style={{ background: 'rgba(232,69,42,0.1)', border: '1px solid rgba(232,69,42,0.2)', color: '#E8452A' }}
                  >
                    {t.client_name.split(' ').map(w => w[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm text-smoke font-medium">{t.client_name}</p>
                    <p className="font-mono-custom text-[0.58rem] tracking-wider text-smoke-faint">
                      {t.client_role} · {t.client_company}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BAND ───────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ background: '#E8452A' }}>
        {/* Diagonal texture */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 8px)',
        }} />
        <div className="relative px-6 lg:px-12 py-20 max-w-screen-xl mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div>
            <h2 className="font-display font-light leading-tight text-ink"
              style={{ fontSize: 'clamp(2.2rem, 4vw, 3.8rem)' }}
            >
              Your next breakthrough video<br /><em>starts here.</em>
            </h2>
            <p className="text-ink/60 mt-3" style={{ fontSize: '0.95rem' }}>
              Tell us what you're trying to achieve. We'll reply in 24 hours with a creative plan and a fixed quote — free.
            </p>
          </div>
          <Link to="/contact"
            className="flex-shrink-0 font-mono-custom text-[0.7rem] tracking-[0.14em] uppercase px-8 py-4 text-decoration-none"
            style={{ background: '#0A0A0B', color: '#F5F4F0' }}
          >
            Get a free quote
          </Link>
        </div>
      </section>

      {/* ── QUOTE FORM (inline on home) ────────────────────── */}
      <section className="bg-ink-2 py-24 px-6 lg:px-12" id="quote">
        <div className="max-w-screen-xl mx-auto grid lg:grid-cols-2 gap-16">
          <div>
            <p className="eyebrow mb-4 reveal">Free quote · 24h reply</p>
            <h2 className="font-display font-light leading-tight mb-10 reveal reveal-delay-1"
              style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)' }}
            >
              Tell us your <em className="text-gold">goal.</em>
            </h2>
            <QuoteForm />
          </div>
          <div className="reveal reveal-delay-2 pt-4">
            <h3 className="font-display font-light text-2xl text-smoke mb-6 leading-snug">
              One reply within <em className="text-gold">24 hours.</em> No sales pressure.
            </h3>
            {[
              { n:'01', t:'Free 30-minute strategy call — walk away with ideas, even if you don\'t hire us.' },
              { n:'02', t:'A concrete proposal: creative plan, timeline, and fixed price with zero surprises.' },
              { n:'03', t:'One partner, every format — brand, product, AI, drone, social. We handle it all.' },
              { n:'04', t:'Agency-friendly: white-label production with your branding and zero overhead.' },
            ].map(({ n, t }) => (
              <div key={n} className="flex gap-4 py-4 border-b border-white/5">
                <span className="font-mono-custom text-[0.65rem] text-ember min-w-[2rem]">{n}</span>
                <p className="text-sm text-smoke-dim leading-relaxed">{t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

// ── Sub-components ──────────────────────────────

function QuoteForm() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const payload = {
      full_name: fd.get('full_name') as string,
      email: fd.get('email') as string,
      company: fd.get('company') as string,
      service_type: fd.get('service_type') as string,
      budget_range: fd.get('budget_range') as string,
      message: fd.get('message') as string,
    }
    await supabase.from('quote_requests').insert([payload])
    setLoading(false)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="border border-ember/20 p-8 text-center">
        <div className="font-display text-2xl text-smoke mb-2">Thank you.</div>
        <p className="text-sm text-smoke-dim">We'll be in touch within 24 hours.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Full name *</label>
          <input name="full_name" required className="form-input" placeholder="Jane Smith" />
        </div>
        <div>
          <label className="form-label">Company</label>
          <input name="company" className="form-input" placeholder="Acme Corp" />
        </div>
      </div>
      <div>
        <label className="form-label">Email *</label>
        <input name="email" type="email" required className="form-input" placeholder="jane@acme.com" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Service type</label>
          <select name="service_type" className="form-select">
            <option value="">Select...</option>
            {['Brand & Commercial', 'AI Video', 'Product & Ecommerce', 'Social Video', 'Post Production', 'Drone & Aerial', 'eLearning', 'Other'].map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Budget range</label>
          <select name="budget_range" className="form-select">
            <option value="">Select...</option>
            {['< $1,000', '$1k – $5k', '$5k – $15k', '$15k – $50k', '$50k+'].map(b => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="form-label">Project brief</label>
        <textarea name="message" className="form-textarea" placeholder="Tell us about your vision, timeline, and goals..." />
      </div>
      <button type="submit" disabled={loading} className="btn btn-primary self-start">
        {loading ? 'Sending...' : 'Send request →'}
      </button>
    </form>
  )
}
