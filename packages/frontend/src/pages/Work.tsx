import { useState } from 'react'
import { Link } from 'react-router-dom'
import Seo from '@/components/Seo'

const PORTFOLIO = [
  // Brand & Commercial
  { id: '1',  youtube_id: 'HAHj0TDQZcg',  title: 'A Steampunk Princess',                      category: 'brand',    client: 'Creative Direction',   tags: ['Cinematic', 'Drama'] },
  { id: '2',  youtube_id: 'SgHHbWp64cE',  title: 'Virus House Teaser',                        category: 'brand',    client: 'Film Project',         tags: ['Brand', 'Cinematic'] },
  { id: '3',  youtube_id: 'MHXXNX1LG7c',  title: 'Irving Scott Trailer',                      category: 'brand',    client: 'Irving Books',         tags: ['Brand', 'Trailer'] },
  // AI Video
  { id: '4',  youtube_id: '9k5w1iG_JHM',  title: 'Gen AI Video by Imba Production',           category: 'ai',       client: 'Imba Production',      tags: ['AI', 'Innovation'] },
  { id: '5',  youtube_id: '_eCIYm1_Hpo',  title: 'A Driving Through Futuristic City at Night', category: 'ai',       client: 'Creative Project',     tags: ['AI', 'Generative'] },
  { id: '6',  youtube_id: 'rzfWrv3ERxk',  title: 'Artificial Intelligence Corporate Video',   category: 'ai',       client: 'Tech Company',         tags: ['AI', 'Corporate'] },
  // Cooking & Food
  { id: '7',  youtube_id: 'SOt1I5u0yvE',  title: 'Cooking Video Reel #1',                     category: 'cooking',  client: 'Culinary Brand',       tags: ['Cooking', 'Reel'] },
  { id: '8',  youtube_id: 'cBJoEGPMHoE',  title: 'Cooking Video Reel #2',                     category: 'cooking',  client: 'Culinary Brand',       tags: ['Cooking', 'Reel'] },
  { id: '9',  youtube_id: 'EtBSTn9hKuY',  title: 'Cooking Video Reel #3',                     category: 'cooking',  client: 'Food Platform',        tags: ['Cooking', 'Reel'] },
  { id: '10', youtube_id: 'Ej4HgOORaZ4',  title: 'Basket of French Fries — Cooking Video',   category: 'cooking',  client: 'Restaurant Brand',     tags: ['Cooking', 'Food'] },
  { id: '11', youtube_id: 'l9aUWFEVO_4',  title: 'Pumpkin Soup in a Wooden Bowl',             category: 'cooking',  client: 'Culinary Brand',       tags: ['Cooking', 'Cinematic'] },
  { id: '12', youtube_id: 'jBPNnr-j0c8',  title: 'Two Delicious Sandwiches with Hummus',      category: 'cooking',  client: 'Food Creator',         tags: ['Cooking', 'Lifestyle'] },
  // Drone & Aerial
  { id: '13', youtube_id: '_fbHbplDCwo',  title: 'Yoga on the Lake, Serbia',                  category: 'drone',    client: 'Wellness Brand',       tags: ['Drone', 'Lifestyle'] },
  { id: '14', youtube_id: 'BCtrr3I70sk',  title: "Vietnam's Top 5 Most Incredible Hotels",    category: 'drone',    client: 'Travel Publisher',     tags: ['Drone', 'Travel'] },
  { id: '15', youtube_id: 'PhjpiJ5jcBo',  title: 'Ovčar Banja, Serbia — Real Estate 4K',     category: 'drone',    client: 'Prime Real Estate',    tags: ['Drone', 'Real Estate'] },
  // Short & Social
  { id: '16', youtube_id: 'PHxMQ6FSiks',  title: 'Natural Soap Social Media Ad',              category: 'social',   client: 'Kozica Soaps',         tags: ['Social', 'Product'] },
  { id: '17', youtube_id: 'LqPEeYQUaeQ',  title: 'Fine Droplets',                             category: 'social',   client: 'Creative Project',     tags: ['Social', 'Product'] },
  // Post Production
  { id: '18', youtube_id: 'EZUJiL9MeLw',  title: 'The Creature Transformation',               category: 'post',     client: 'Creative Project',     tags: ['VFX', 'Post Production'] },
]

const CATS = [
  { key: 'all',     label: 'All work' },
  { key: 'brand',   label: 'Brand & Commercial' },
  { key: 'ai',      label: 'AI Video' },
  { key: 'cooking', label: 'Cooking & Food' },
  { key: 'drone',   label: 'Drone & Aerial' },
  { key: 'social',  label: 'Short & Social' },
  { key: 'post',    label: 'Post Production' },
]

const CAT_COLOR: Record<string, string> = {
  brand: '#E8452A', ai: '#C9A96E', cooking: '#E87A2A',
  drone: '#8A8AFF', social: '#3CBFAE', post: '#6C7AE0',
}

const STATS = [
  { num: '500+', label: 'Videos produced' },
  { num: '12+', label: 'Years in production' },
  { num: '48h', label: 'Average turnaround' },
  { num: '98%', label: 'Client satisfaction' },
]

export default function Work() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const filtered = activeCategory === 'all'
    ? PORTFOLIO
    : PORTFOLIO.filter(p => p.category === activeCategory)

  return (
    <>
      <Seo
        title="Our Work — Video Portfolio"
        description="Cinematic storytelling across brand, product, social, AI, and drone. Browse selected work from Imba Production's video portfolio."
        canonicalPath="/work"
      />
      {/* ── PAGE HERO ─────────────────────────────────────── */}
      <section className="pt-36 pb-16 px-6 lg:px-12 bg-ink relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }} />
        <div className="absolute top-0 right-0 w-[40vw] h-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 70% at 100% 30%, rgba(232,69,42,0.06) 0%, transparent 65%)' }}
        />
        <div className="relative max-w-screen-xl mx-auto">
          <p className="eyebrow mb-5 reveal">Selected work</p>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <h1 className="font-display font-light leading-none reveal reveal-delay-1"
              style={{ fontSize: 'clamp(3rem, 6vw, 5.5rem)' }}>
              500+ stories<br />
              <em className="text-gold italic">told with video</em>
            </h1>
            <p className="text-smoke-dim max-w-xs leading-relaxed reveal reveal-delay-2" style={{ fontSize: '0.93rem' }}>
              From cinematic brand films to AI-powered campaigns — every frame engineered to captivate and convert.
            </p>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ─────────────────────────────────────── */}
      <div className="border-y border-white/6 grid grid-cols-2 lg:grid-cols-4">
        {STATS.map(({ num, label }, i) => (
          <div key={label} className={`px-8 lg:px-10 py-7 ${i < 3 ? 'border-r border-white/6' : ''}`}>
            <div className="font-display font-light text-smoke leading-none" style={{ fontSize: '2.4rem' }}>
              <span>{num.replace(/[+%h]/g, '')}</span>
              <em className="text-ember not-italic">{num.match(/[+%h]/)?.[0] ?? ''}</em>
            </div>
            <div className="font-mono-custom text-[0.58rem] tracking-[0.18em] uppercase text-smoke-faint mt-1.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── CATEGORY FILTER ───────────────────────────────── */}
      <div className="sticky top-16 z-30 bg-ink/95 border-b border-white/5" style={{ backdropFilter: 'blur(12px)' }}>
        <div className="px-6 lg:px-12 py-4 max-w-screen-xl mx-auto flex gap-1.5 overflow-x-auto">
          {CATS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className="flex-shrink-0 font-mono-custom text-[0.65rem] tracking-[0.12em] uppercase px-4 py-2 transition-all duration-200"
              style={{
                background: activeCategory === key ? '#E8452A' : 'transparent',
                color: activeCategory === key ? '#F5F4F0' : '#6B6A65',
                border: `1px solid ${activeCategory === key ? '#E8452A' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── PORTFOLIO GRID ────────────────────────────────── */}
      <section className="bg-ink py-12 px-6 lg:px-12">
        <div className="max-w-screen-xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group relative aspect-video cursor-pointer overflow-hidden bg-ink-3"
              onClick={() => setPlayingId(item.youtube_id)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <img
                src={`https://img.youtube.com/vi/${item.youtube_id}/maxresdefault.jpg`}
                alt={item.title}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                onError={e => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${item.youtube_id}/hqdefault.jpg` }}
              />

              {/* Gradient */}
              <div className="absolute inset-0 transition-opacity duration-300"
                style={{ background: 'linear-gradient(to top, rgba(10,10,11,0.92) 0%, rgba(10,10,11,0.2) 50%, transparent 100%)', opacity: hoveredId === item.id ? 1 : 0.65 }}
              />

              {/* Scanlines */}
              <div className="absolute inset-0 opacity-20 pointer-events-none"
                style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)' }}
              />

              {/* Corner marks */}
              <div className={`absolute inset-3 pointer-events-none transition-opacity duration-300 ${hoveredId === item.id ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-ember/60" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-ember/60" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-ember/60" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-ember/60" />
              </div>

              {/* Play button */}
              <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${hoveredId === item.id ? 'opacity-100' : 'opacity-0'}`}>
                <div className="w-16 h-16 rounded-full border border-white/30 flex items-center justify-center"
                  style={{ background: 'rgba(232,69,42,0.18)', backdropFilter: 'blur(4px)' }}>
                  <div style={{ borderLeft: '16px solid rgba(255,255,255,0.9)', borderTop: '10px solid transparent', borderBottom: '10px solid transparent', marginLeft: '4px' }} />
                </div>
              </div>

              {/* Category badge */}
              <div className="absolute top-4 right-4 font-mono-custom text-[0.55rem] tracking-widest uppercase px-2 py-1"
                style={{ background: `${CAT_COLOR[item.category] || '#E8452A'}22`, color: CAT_COLOR[item.category] || '#E8452A', border: `1px solid ${CAT_COLOR[item.category] || '#E8452A'}33` }}>
                {item.category}
              </div>

              {/* Meta */}
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <div className="font-mono-custom text-[0.55rem] tracking-[0.18em] uppercase mb-1.5"
                  style={{ color: CAT_COLOR[item.category] || '#E8452A' }}>
                  {item.client}
                </div>
                <div className="font-display font-light text-smoke text-xl leading-tight">{item.title}</div>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {item.tags.map(t => (
                    <span key={t} className="font-mono-custom text-[0.52rem] tracking-wider text-smoke-faint/60 uppercase">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA BAND ─────────────────────────────────────── */}
      <section className="bg-ink-2 py-20 px-6 lg:px-12 border-t border-white/5">
        <div className="max-w-screen-xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-8">
          <div>
            <p className="eyebrow mb-4">Ready to be next?</p>
            <h2 className="font-display font-light text-smoke leading-tight"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)' }}>
              Let's create something<br /><em className="text-gold italic">extraordinary together</em>
            </h2>
            <p className="text-smoke-dim mt-3 max-w-md" style={{ fontSize: '0.93rem' }}>
              Every great video starts with a conversation. Tell us your vision and we'll build it — free quote, 24h reply.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 flex-shrink-0">
            <Link to="/contact" className="btn btn-primary">Get a free quote</Link>
            <Link to="/services" className="btn btn-ghost">Explore services →</Link>
          </div>
        </div>
      </section>

      {/* ── VIDEO MODAL ──────────────────────────────────── */}
      {playingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:p-16"
          style={{ background: 'rgba(0,0,0,0.97)' }}
          onClick={() => setPlayingId(null)}
        >
          <div className="relative w-full max-w-5xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPlayingId(null)}
              className="absolute -top-10 right-0 font-mono-custom text-[0.65rem] tracking-widest uppercase text-smoke-faint hover:text-smoke transition-colors"
            >
              Close ✕
            </button>
            <div className="absolute -top-px -left-px w-5 h-5 border-t border-l border-ember/50" />
            <div className="absolute -top-px -right-px w-5 h-5 border-t border-r border-ember/50" />
            <div className="absolute -bottom-px -left-px w-5 h-5 border-b border-l border-ember/50" />
            <div className="absolute -bottom-px -right-px w-5 h-5 border-b border-r border-ember/50" />
            <div className="aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${playingId}?autoplay=1&controls=1&rel=0&modestbranding=1`}
                className="w-full h-full"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
