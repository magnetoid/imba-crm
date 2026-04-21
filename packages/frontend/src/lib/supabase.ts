import { createClient } from '@supabase/supabase-js'

// VITE_SUPABASE_URL is baked at build time. If it's missing or a placeholder,
// fall back to the nginx proxy path on the same origin — works on any domain
// without needing the build arg to be set correctly.
const _buildUrl = import.meta.env.VITE_SUPABASE_URL as string
const isPlaceholder = !_buildUrl || _buildUrl.includes('placeholder') || _buildUrl.includes('undefined')
const supabaseUrl = isPlaceholder
  ? (typeof window !== 'undefined' ? `${window.location.origin}/supabase` : '/supabase')
  : _buildUrl

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (isPlaceholder) {
  console.info('VITE_SUPABASE_URL not set — using nginx proxy at /supabase')
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey || 'placeholder'
)

// ── Types ──────────────────────────────────────────

export interface PortfolioItem {
  id: string
  title: string
  slug: string
  category: 'brand' | 'ai' | 'product' | 'social' | 'drone' | 'post' | 'elearning'
  client_name?: string
  thumbnail_url?: string
  video_url?: string
  vimeo_id?: string
  youtube_id?: string
  description?: string
  results?: Record<string, string>
  tags?: string[]
  featured: boolean
  homepage_featured?: boolean
  published: boolean
  sort_order: number
  created_at: string
}

export interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt?: string
  body?: string
  cover_image_url?: string
  author_id?: string
  category?: string
  tags?: string[]
  seo_title?: string
  seo_description?: string
  read_time_minutes?: number
  published: boolean
  published_at?: string
  created_at: string
  status?: 'draft' | 'published' | 'scheduled'
  author_name?: string
  og_image_url?: string
  category_id?: string
  featured_image_url?: string
  blog_categories?: { name: string; slug: string }
}

export interface BlogCategory {
  id: string
  name: string
  slug: string
  description?: string
  parent_id?: string
  created_at: string
}

export interface BlogTag {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface MediaFile {
  id: string
  filename: string
  original_name?: string
  mime_type?: string
  size?: number
  url: string
  alt?: string
  caption?: string
  created_at: string
}

export interface Service {
  id: string
  name: string
  slug: string
  tagline?: string
  description?: string
  long_description?: string
  cover_image_url?: string
  icon_key?: string
  features?: { title: string; desc: string }[]
  pricing_hint?: string
  sort_order: number
  published: boolean
}

export interface Testimonial {
  id: string
  client_name: string
  client_role?: string
  client_company?: string
  client_avatar_url?: string
  text: string
  rating?: number
  featured: boolean
  published: boolean
}

export interface TeamMember {
  id: string
  name: string
  slug: string
  role?: string
  bio?: string
  photo_url?: string
  social_links?: Record<string, string>
  sort_order: number
  published: boolean
}

export interface HeroVideo {
  id: string
  youtube_id: string
  title: string
  slide_eyebrow?: string
  slide_headline?: string
  slide_headline_em?: string
  slide_subheadline?: string
  sort_order: number
  active: boolean
  created_at: string
}

export interface QuoteRequest {
  id?: string
  full_name: string
  email: string
  company?: string
  service_type?: string
  budget_range?: string
  message?: string
  status?: string
  created_at?: string
}
