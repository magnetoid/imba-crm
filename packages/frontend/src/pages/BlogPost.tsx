import { useState, useEffect } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { BlogPost as BlogPostType } from '@/lib/supabase'
import { marked } from 'marked'
import { sanitizeHtml } from '@/utils/sanitizeHtml'
import Seo from '@/components/Seo'
import { useQuoteModal } from '@/contexts/QuoteModalContext'

const CAT_COLOR: Record<string, string> = {
  'AI Video': '#C9A96E',
  'Video Production': '#E8452A',
  'TikTok': '#3CBFAE',
  'Film': '#8A8AFF',
  'Technology': '#6C7AE0',
  'Brand Film': '#C9A96E',
  'Social Media': '#3CBFAE',
  'Drone': '#6C7AE0',
  'Post Production': '#8A8AFF',
  'eCommerce': '#E8452A',
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<BlogPostType | null | undefined>(undefined)
  const [bodyHtml, setBodyHtml] = useState('')
  const [copied, setCopied] = useState(false)
  const { openModal } = useQuoteModal()

  useEffect(() => {
    if (!slug) { setPost(null); return }
    supabase.from('blog_posts')
      .select('*, blog_categories(name, slug)')
      .eq('slug', slug)
      .eq('published', true)
      .single()
      .then(({ data }) => {
        setPost(data || null)
        if (data?.body) {
          const looksLikeHtml = /<\w[\s\S]*>/.test(data.body)
          if (looksLikeHtml) {
            setBodyHtml(sanitizeHtml(data.body))
            return
          }
          const result = marked.parse(data.body)
          if (typeof result === 'string') {
            setBodyHtml(sanitizeHtml(result))
          } else {
            result.then(html => setBodyHtml(sanitizeHtml(html)))
          }
        }
      })
  }, [slug])

  // Loading
  if (post === undefined) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-ember border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Not found
  if (post === null) {
    return <Navigate to="/blog" replace />
  }

  const categoryName = post.blog_categories?.name || post.category || ''
  const catColor = CAT_COLOR[categoryName] || '#E8452A'

  const formattedDate = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(post.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <Seo
        title={post.seo_title || post.title}
        description={post.seo_description || post.excerpt || undefined}
        ogTitle={post.title}
        ogDescription={post.excerpt || undefined}
        ogImage={post.og_image_url || post.cover_image_url || undefined}
        ogType="article"
        canonicalPath={`/blog/${post.slug}`}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          'headline': post.title,
          'description': post.excerpt,
          'image': post.cover_image_url,
          'author': { '@type': 'Organization', 'name': post.author_name || 'Imba Production' },
          'publisher': { '@type': 'Organization', 'name': 'Imba Production', 'url': 'https://imbaproduction.com' },
          'datePublished': post.published_at || post.created_at,
          'dateModified': post.created_at,
          'url': `https://imbaproduction.com/blog/${post.slug}`,
        }}
      />
      {/* ── PAGE HERO ─────────────────────────────────────── */}
      <section className="pt-36 pb-16 px-6 lg:px-12 bg-ink relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }} />
        <div className="absolute top-0 right-0 w-[50vw] h-full pointer-events-none"
          style={{ background: `radial-gradient(ellipse 60% 70% at 100% 30%, ${catColor}08 0%, transparent 65%)` }}
        />

        <div className="relative max-w-screen-lg mx-auto">
          {/* Eyebrow: category */}
          {categoryName && (
            <div className="mb-5">
              <span
                className="font-mono-custom text-[0.62rem] tracking-widest uppercase px-3 py-1.5 inline-block"
                style={{ background: `${catColor}18`, color: catColor, border: `1px solid ${catColor}30` }}
              >
                {categoryName}
              </span>
            </div>
          )}

          {/* Title */}
          <h1 className="font-display font-light text-smoke leading-tight mb-6"
            style={{ fontSize: 'clamp(2.2rem, 4.5vw, 4rem)' }}>
            {post.title}
          </h1>

          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-smoke-dim leading-relaxed mb-8 max-w-2xl" style={{ fontSize: '1.05rem' }}>
              {post.excerpt}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-6">
            {post.author_name && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-ember/20 flex items-center justify-center">
                  <span className="text-ember text-xs font-medium">{post.author_name[0]}</span>
                </div>
                <span className="font-mono-custom text-[0.65rem] tracking-wider text-smoke-faint uppercase">{post.author_name}</span>
              </div>
            )}
            <span className="font-mono-custom text-[0.62rem] tracking-widest text-smoke-faint/60 uppercase">{formattedDate}</span>
            {post.read_time_minutes && (
              <span className="font-mono-custom text-[0.62rem] text-smoke-faint/40">{post.read_time_minutes} min read</span>
            )}
          </div>
        </div>
      </section>

      {/* ── COVER IMAGE ───────────────────────────────────── */}
      {(post.featured_image_url || post.cover_image_url) && (
        <div className="bg-ink px-6 lg:px-12 pb-8">
          <div className="max-w-screen-lg mx-auto">
            <img
              src={post.featured_image_url || post.cover_image_url}
              alt={post.title}
              className="w-full aspect-video object-cover"
            />
          </div>
        </div>
      )}

      {/* ── BODY ─────────────────────────────────────────── */}
      <section className="bg-ink px-6 lg:px-12 py-12">
        <div className="max-w-screen-lg mx-auto grid lg:grid-cols-[1fr_280px] gap-12">
          {/* Prose */}
          <article
            className="prose-blog"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />

          {/* Sidebar */}
          <aside className="space-y-8">
            {/* Share buttons */}
            <div>
              <p className="font-mono-custom text-[0.6rem] tracking-[0.2em] uppercase text-smoke-faint/50 mb-3">Share this post</p>
              <div className="flex flex-col gap-2">
                {[
                  {
                    label: 'Share on X / Twitter',
                    href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(`https://imbaproduction.com/blog/${post.slug}`)}&text=${encodeURIComponent(post.title)}`,
                  },
                  {
                    label: 'Share on LinkedIn',
                    href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://imbaproduction.com/blog/${post.slug}`)}`,
                  },
                  {
                    label: 'Share on Facebook',
                    href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://imbaproduction.com/blog/${post.slug}`)}`,
                  },
                ].map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono-custom text-[0.6rem] tracking-[0.12em] uppercase px-3 py-2 border border-white/8 text-smoke-faint/50 hover:border-white/20 hover:text-smoke-dim transition-all"
                  >
                    {label} →
                  </a>
                ))}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://imbaproduction.com/blog/${post.slug}`)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="font-mono-custom text-[0.6rem] tracking-[0.12em] uppercase px-3 py-2 border border-white/8 text-smoke-faint/50 hover:border-white/20 hover:text-smoke-dim transition-all text-left"
                >
                  {copied ? '✓ Link copied!' : 'Copy link'}
                </button>
              </div>
            </div>

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div>
                <p className="font-mono-custom text-[0.6rem] tracking-[0.2em] uppercase text-smoke-faint/50 mb-3">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {post.tags.map(tag => (
                    <span key={tag}
                      className="font-mono-custom text-[0.58rem] tracking-[0.12em] uppercase px-2.5 py-1 border border-white/8 text-smoke-faint/50">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* CTA card */}
            <div className="border border-white/8 p-6 bg-ink-2">
              <p className="font-mono-custom text-[0.6rem] tracking-[0.2em] uppercase text-ember mb-3">Work with us</p>
              <p className="text-smoke-dim text-sm leading-relaxed mb-4">
                Ready to bring your vision to life? Let's talk about your next video project.
              </p>
              <button
                onClick={() => openModal()}
                className="font-mono-custom text-[0.65rem] tracking-[0.14em] uppercase text-ember flex items-center gap-2 hover:gap-3 transition-all bg-transparent border-none cursor-pointer p-0"
              >
                <span>Get a free quote</span>
                <span>→</span>
              </button>
            </div>
          </aside>
        </div>
      </section>

      {/* ── BACK TO BLOG + CTA ───────────────────────────── */}
      <section className="bg-ink-2 px-6 lg:px-12 py-10 border-t border-white/5">
        <div className="max-w-screen-lg mx-auto flex items-center justify-between">
          <Link
            to="/blog"
            className="font-mono-custom text-[0.65rem] tracking-[0.14em] uppercase text-smoke-faint flex items-center gap-2 hover:text-smoke transition-colors"
          >
            <span>←</span>
            <span>Back to blog</span>
          </Link>
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
