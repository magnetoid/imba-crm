import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { BlogPost } from '@/lib/supabase'
import Seo from '@/components/Seo'

const STATIC_POSTS = [
  {
    id: '1',
    title: 'How to Explode Your Sales Using AI Video: The Ultimate Guide for 2026',
    excerpt: 'AI video outreach gets 2–3× more response rates than plain text. Discover the exact workflow we use to produce AI-powered video campaigns that convert.',
    category: 'AI Video',
    date: 'March 8, 2026',
    read_time: 9,
    featured: true,
    slug: 'ai-video-sales-guide-2026',
  },
  {
    id: '2',
    title: 'How to Generate Sales with Video Products: A Comprehensive Guide',
    excerpt: 'Product videos increase conversions by up to 80%. This guide covers every type of product video — from demos to testimonials — and when to use each.',
    category: 'Video Production',
    date: 'March 30, 2025',
    read_time: 8,
    featured: false,
    slug: 'generate-sales-video-products',
  },
  {
    id: '3',
    title: 'The Impact of AI on Video Production in 2025',
    excerpt: 'From automated editing and AI avatars to generative B-roll — how AI is fundamentally changing what\'s possible in video production, and how to stay ahead.',
    category: 'AI Video',
    date: 'January 13, 2025',
    read_time: 7,
    featured: false,
    slug: 'ai-impact-video-production-2025',
  },
  {
    id: '4',
    title: 'Going Viral: Strategies for eCommerce Brands on TikTok',
    excerpt: 'TikTok drives billions in ecommerce sales. Learn the content formats, posting cadences, and production techniques that actually lead to viral product videos.',
    category: 'TikTok',
    date: 'December 25, 2024',
    read_time: 6,
    featured: false,
    slug: 'tiktok-ecommerce-viral-strategies',
  },
  {
    id: '5',
    title: 'How to Generate Website Traffic with Video SEO in 2025',
    excerpt: 'YouTube is the world\'s second-largest search engine. A practical guide to optimising your video content for discovery, featuring our exact keyword strategy.',
    category: 'Video Production',
    date: 'October 28, 2024',
    read_time: 7,
    featured: false,
    slug: 'video-seo-traffic-2025',
  },
  {
    id: '6',
    title: 'Transforming Views into Sales: The Power of Shoppable Video',
    excerpt: 'Shoppable video bridges the gap between content and commerce. A complete breakdown of the technology, platforms, and creative approach that converts viewers into buyers.',
    category: 'AI Video',
    date: 'September 22, 2024',
    read_time: 5,
    featured: false,
    slug: 'shoppable-video-sales',
  },
  {
    id: '7',
    title: 'TikTok Success: A Step-by-Step Guide to Shooting Engaging Brand Videos',
    excerpt: 'Production tips, creative formats, and the exact shooting checklist we use to produce TikTok content that consistently outperforms clients\' existing organic reach.',
    category: 'TikTok',
    date: 'September 21, 2024',
    read_time: 6,
    featured: false,
    slug: 'tiktok-brand-video-guide',
  },
  {
    id: '8',
    title: 'Why User-Generated Content is Revolutionizing Digital Marketing',
    excerpt: 'UGC converts at 4× the rate of brand-produced content. Here\'s how to brief, direct, and edit UGC-style videos that feel authentic and drive real results.',
    category: 'Video Production',
    date: 'September 20, 2024',
    read_time: 5,
    featured: false,
    slug: 'ugc-digital-marketing',
  },
  {
    id: '9',
    title: 'Unleash Creativity: Master Micro Drama in Video Production',
    excerpt: 'Micro-dramas are exploding on every platform. A deep dive into the format, storytelling structure, and production workflow that makes these short films so addictive.',
    category: 'Film',
    date: 'October 27, 2024',
    read_time: 6,
    featured: false,
    slug: 'micro-drama-video-production',
  },
  {
    id: '10',
    title: 'Exploring the Latest Advances in 4K and 8K Video Technology',
    excerpt: 'How the latest camera technology is changing what\'s possible in commercial production — and how we use it to deliver broadcast-quality footage for brand campaigns.',
    category: 'Technology',
    date: 'February 24, 2025',
    read_time: 6,
    featured: false,
    slug: '4k-8k-video-technology',
  },
  {
    id: '11',
    title: 'The Rise of AI in Video Production: A 2024 Perspective',
    excerpt: 'A comprehensive look at how AI tools — Runway, Sora, Stable Diffusion — are reshaping production pipelines and what it means for brands and agencies.',
    category: 'AI Video',
    date: 'January 13, 2025',
    read_time: 8,
    featured: false,
    slug: 'ai-video-production-2024',
  },
  {
    id: '12',
    title: 'Unleashing Future Visions: Generative AI Video 2025',
    excerpt: 'Generative AI video has crossed the uncanny valley. How we\'re integrating tools like Sora into real client productions — and the results we\'re seeing.',
    category: 'AI Video',
    date: 'October 12, 2024',
    read_time: 7,
    featured: false,
    slug: 'generative-ai-video-2025',
  },
]

const STATIC_CATEGORIES = ['All', 'AI Video', 'Video Production', 'TikTok', 'Film', 'Technology']

const CAT_COLOR: Record<string, string> = {
  'AI Video': '#C9A96E',
  'Video Production': '#E8452A',
  'TikTok': '#3CBFAE',
  'Film': '#8A8AFF',
  'Technology': '#6C7AE0',
}

interface DisplayPost {
  id: string
  title: string
  excerpt: string
  category: string
  date: string
  read_time: number
  featured: boolean
  slug: string
}

function toDisplayPost(p: BlogPost): DisplayPost {
  const cat = (p.blog_categories?.name) || p.category || 'Uncategorised'
  return {
    id: p.id,
    title: p.title,
    excerpt: p.excerpt || '',
    category: cat,
    date: p.published_at
      ? new Date(p.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    read_time: p.read_time_minutes || 5,
    featured: false,
    slug: p.slug,
  }
}

export default function Blog() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [livePosts, setLivePosts] = useState<DisplayPost[]>([])

  useEffect(() => {
    supabase.from('blog_posts')
      .select('*, blog_categories(name, slug)')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .then(({ data }) => {
        if (data?.length) setLivePosts(data.map(toDisplayPost))
      })
  }, [])

  const POSTS = livePosts.length > 0 ? livePosts : STATIC_POSTS
  const allCategories = livePosts.length > 0
    ? ['All', ...Array.from(new Set(livePosts.map(p => p.category)))]
    : STATIC_CATEGORIES

  const filtered = activeCategory === 'All'
    ? POSTS
    : POSTS.filter(p => p.category === activeCategory)

  const featured = POSTS.find(p => p.featured) || POSTS[0]

  return (
    <>
      <Seo
        title="Blog — Video Production Insights"
        description="Ideas, process, and perspective on video production, AI campaigns, brand storytelling, and creative strategy from the Imba Production team."
        canonicalPath="/blog"
      />
      {/* ── PAGE HERO ─────────────────────────────────────── */}
      <section className="pt-36 pb-16 px-6 lg:px-12 bg-ink relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }} />
        <div className="absolute top-0 right-0 w-[40vw] h-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 70% at 100% 30%, rgba(201,169,110,0.05) 0%, transparent 65%)' }}
        />
        <div className="relative max-w-screen-xl mx-auto">
          <p className="eyebrow mb-5 reveal">Video production insights</p>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <h1 className="font-display font-light leading-none reveal reveal-delay-1"
              style={{ fontSize: 'clamp(3rem, 6vw, 5.5rem)' }}>
              Expert tips,<br />
              <em className="text-gold italic">real results</em>
            </h1>
            <p className="text-smoke-dim max-w-xs leading-relaxed reveal reveal-delay-2" style={{ fontSize: '0.93rem' }}>
              185+ articles on video production, AI, TikTok strategy, and converting views into sales.
            </p>
          </div>
        </div>
      </section>

      {/* ── FEATURED POST ─────────────────────────────────── */}
      {activeCategory === 'All' && featured && (
        <section className="bg-ink px-6 lg:px-12 pb-8">
          <div className="max-w-screen-xl mx-auto">
            <Link
              to={`/blog/${featured.slug}`}
              className="grid lg:grid-cols-2 gap-0 border border-white/8 group cursor-pointer hover:border-white/15 transition-colors"
            >
              {/* Visual */}
              <div className="relative overflow-hidden bg-ink-3 aspect-video lg:aspect-auto">
                <div className="absolute inset-0"
                  style={{ background: 'linear-gradient(135deg, rgba(201,169,110,0.12) 0%, rgba(232,69,42,0.08) 50%, transparent 100%)' }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="font-display font-light text-smoke/20 select-none" style={{ fontSize: 'clamp(5rem, 12vw, 10rem)' }}>AI</div>
                  </div>
                </div>
                <div className="absolute inset-0" style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)',
                }} />
                <div className="absolute top-4 left-4 font-mono-custom text-[0.58rem] tracking-widest uppercase px-2 py-1"
                  style={{ background: `${CAT_COLOR[featured.category] || '#E8452A'}22`, color: CAT_COLOR[featured.category] || '#E8452A', border: `1px solid ${CAT_COLOR[featured.category] || '#E8452A'}33` }}>
                  Featured · {featured.category}
                </div>
              </div>

              {/* Content */}
              <div className="bg-ink-2 p-8 lg:p-10 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-4 mb-5">
                    <span className="font-mono-custom text-[0.6rem] tracking-widest text-smoke-faint uppercase">{featured.date}</span>
                    <span className="font-mono-custom text-[0.58rem] text-smoke-faint/50">{featured.read_time} min read</span>
                  </div>
                  <h2 className="font-display font-light text-smoke leading-tight mb-5"
                    style={{ fontSize: 'clamp(1.6rem, 2.8vw, 2.4rem)' }}>
                    {featured.title}
                  </h2>
                  <p className="text-smoke-dim leading-relaxed" style={{ fontSize: '0.93rem' }}>
                    {featured.excerpt}
                  </p>
                </div>
                <div className="mt-8 flex items-center gap-3">
                  <span className="font-mono-custom text-[0.68rem] tracking-[0.14em] uppercase text-ember flex items-center gap-2 group-hover:gap-3 transition-all">
                    <span>Read article</span>
                    <span>→</span>
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* ── CATEGORY FILTER ───────────────────────────────── */}
      <div className="bg-ink border-b border-white/5 px-6 lg:px-12 py-5">
        <div className="max-w-screen-xl mx-auto flex gap-1.5 overflow-x-auto">
          {allCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="flex-shrink-0 font-mono-custom text-[0.65rem] tracking-[0.12em] uppercase px-4 py-2 transition-all duration-200"
              style={{
                background: activeCategory === cat ? '#E8452A' : 'transparent',
                color: activeCategory === cat ? '#F5F4F0' : '#6B6A65',
                border: `1px solid ${activeCategory === cat ? '#E8452A' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── POSTS GRID ────────────────────────────────────── */}
      <section className="bg-ink py-12 px-6 lg:px-12">
        <div className="max-w-screen-xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(activeCategory === 'All' ? POSTS.filter(p => !p.featured) : filtered).map((post, i) => (
            <Link
              key={post.id}
              to={`/blog/${post.slug}`}
              className="group bg-ink-2 border border-white/5 hover:border-white/12 transition-all duration-300 flex flex-col reveal"
              style={{ transitionDelay: `${i * 50}ms` }}
            >
              {/* Thumbnail area */}
              <div className="relative overflow-hidden aspect-video bg-ink-3 flex-shrink-0">
                <div className="absolute inset-0"
                  style={{ background: `radial-gradient(ellipse 70% 70% at 50% 50%, ${CAT_COLOR[post.category] || '#E8452A'}12 0%, transparent 70%)` }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-display font-light select-none" style={{ fontSize: '4rem', color: `${CAT_COLOR[post.category] || '#E8452A'}18` }}>
                    {post.category === 'AI Video' ? '◈' : post.category === 'TikTok' ? '◉' : post.category === 'Film' ? '◬' : post.category === 'Technology' ? '◰' : '▶'}
                  </span>
                </div>
                <div className="absolute inset-0" style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)',
                }} />
                <div className="absolute top-3 left-3 font-mono-custom text-[0.55rem] tracking-widest uppercase px-2 py-1"
                  style={{ background: `${CAT_COLOR[post.category] || '#E8452A'}22`, color: CAT_COLOR[post.category] || '#E8452A', border: `1px solid ${CAT_COLOR[post.category] || '#E8452A'}33` }}>
                  {post.category}
                </div>
              </div>

              {/* Content */}
              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-mono-custom text-[0.58rem] tracking-widest text-smoke-faint uppercase">{post.date}</span>
                  <span className="font-mono-custom text-[0.55rem] text-smoke-faint/40">{post.read_time} min</span>
                </div>
                <h3 className="font-display font-light text-smoke leading-tight mb-3 group-hover:text-ember transition-colors flex-1"
                  style={{ fontSize: '1.15rem' }}>
                  {post.title}
                </h3>
                <p className="text-smoke-dim leading-relaxed mb-5" style={{ fontSize: '0.82rem' }}>
                  {post.excerpt}
                </p>
                <div className="flex items-center gap-2 mt-auto font-mono-custom text-[0.62rem] tracking-[0.14em] uppercase text-ember group-hover:gap-3 transition-all">
                  <span>Read more</span>
                  <span>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* View all on WordPress */}
        <div className="max-w-screen-xl mx-auto mt-12 text-center">
          <a
            href="https://www.imbaproduction.com/blog/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost inline-flex items-center gap-2"
          >
            View all 185+ articles on our blog ↗
          </a>
        </div>
      </section>

      {/* ── TOPICS STRIP ─────────────────────────────────── */}
      <section className="bg-ink-2 py-16 px-6 lg:px-12 border-t border-white/5">
        <div className="max-w-screen-xl mx-auto">
          <p className="font-mono-custom text-[0.62rem] tracking-[0.2em] uppercase text-smoke-faint/50 mb-8 text-center">Content pillars</p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              'AI & Generative Video', 'TikTok Content Strategy', 'Cooking Video Production',
              'eCommerce Product Video', 'YouTube Growth', 'Brand Film Craft',
              'Video Equipment & Tech', 'Video SEO', 'Short-Form Content',
              'Post Production', 'Drone Cinematography', 'eLearning Video',
            ].map(topic => (
              <span key={topic}
                className="font-mono-custom text-[0.62rem] tracking-[0.12em] uppercase px-3 py-2 border border-white/8 text-smoke-faint/50 hover:text-smoke-faint hover:border-white/15 transition-colors cursor-default">
                {topic}
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
              Ready to create something<br /><em>extraordinary?</em>
            </h2>
            <p className="text-ink/60 mt-3" style={{ fontSize: '0.95rem' }}>
              Talk to our team. Free quote, 24h reply, no commitment.
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
