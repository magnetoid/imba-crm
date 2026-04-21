-- ═══════════════════════════════════════════════════════════
--  Imba Production — Database Init
--  Runs on first Supabase PostgreSQL startup
-- ═══════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ── Schemas ─────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;

-- ── Roles ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════
--  TABLES
-- ═══════════════════════════════════════════════════════════

-- ── Team members ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  role        TEXT,
  bio         TEXT,
  photo_url   TEXT,
  social_links JSONB DEFAULT '{}',
  sort_order  INTEGER DEFAULT 0,
  published   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Portfolio items ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('brand','ai','product','social','drone','post','elearning')),
  client_name     TEXT,
  thumbnail_url   TEXT,
  video_url       TEXT,
  vimeo_id        TEXT,
  youtube_id      TEXT,
  description     TEXT,
  results         JSONB DEFAULT '{}',
  tags            TEXT[] DEFAULT '{}',
  featured        BOOLEAN DEFAULT false,
  published       BOOLEAN DEFAULT false,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Blog posts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  excerpt           TEXT,
  body              TEXT,
  cover_image_url   TEXT,
  author_id         UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  category          TEXT,
  tags              TEXT[] DEFAULT '{}',
  seo_title         TEXT,
  seo_description   TEXT,
  read_time_minutes INTEGER,
  published         BOOLEAN DEFAULT false,
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Services ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.services (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  tagline           TEXT,
  description       TEXT,
  long_description  TEXT,
  cover_image_url   TEXT,
  icon_key          TEXT,
  features          JSONB DEFAULT '[]',
  pricing_hint      TEXT,
  sort_order        INTEGER DEFAULT 0,
  published         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Testimonials ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.testimonials (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_name       TEXT NOT NULL,
  client_role       TEXT,
  client_company    TEXT,
  client_avatar_url TEXT,
  text              TEXT NOT NULL,
  rating            INTEGER CHECK (rating BETWEEN 1 AND 5),
  portfolio_item_id UUID REFERENCES public.portfolio_items(id) ON DELETE SET NULL,
  featured          BOOLEAN DEFAULT false,
  published         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Quote requests ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quote_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  company       TEXT,
  service_type  TEXT,
  budget_range  TEXT,
  message       TEXT,
  status        TEXT DEFAULT 'new' CHECK (status IN ('new','contacted','proposal_sent','closed_won','closed_lost')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Site settings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  INDEXES
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_portfolio_published ON public.portfolio_items(published, sort_order);
CREATE INDEX IF NOT EXISTS idx_portfolio_category ON public.portfolio_items(category);
CREATE INDEX IF NOT EXISTS idx_portfolio_featured ON public.portfolio_items(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_blog_published ON public.blog_posts(published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_slug ON public.blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_testimonials_published ON public.testimonials(published);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quote_requests(status, created_at DESC);

-- ═══════════════════════════════════════════════════════════
--  UPDATED_AT TRIGGER
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_portfolio_updated_at
  BEFORE UPDATE ON public.portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_blog_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════

-- ── Admin allowlist (fallback when JWT role isn't set) ─────
CREATE TABLE IF NOT EXISTS public.admin_allowlist (
  email      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_allowlist' AND policyname='service_role_manage_admin_allowlist') THEN
    CREATE POLICY "service_role_manage_admin_allowlist" ON public.admin_allowlist
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

REVOKE ALL ON public.admin_allowlist FROM anon, authenticated;
GRANT ALL ON public.admin_allowlist TO service_role;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claims AS (
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb AS c
  ),
  roles AS (
    SELECT
      (c->'app_metadata'->>'role') AS app_role,
      (c->'user_metadata'->>'role') AS user_role,
      (c->>'email') AS email1,
      (c->'user_metadata'->>'email') AS email2
    FROM claims
  )
  SELECT COALESCE(
    (roles.app_role = 'admin')
    OR (roles.user_role = 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.admin_allowlist a
      WHERE lower(a.email) = lower(COALESCE(roles.email1, roles.email2, ''))
    ),
    false
  )
  FROM roles;
$$;

ALTER TABLE public.portfolio_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings    ENABLE ROW LEVEL SECURITY;

-- Portfolio: public read published, admin full access
CREATE POLICY "public_read_portfolio" ON public.portfolio_items
  FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "admin_all_portfolio" ON public.portfolio_items
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Blog: public read published
CREATE POLICY "public_read_blog" ON public.blog_posts
  FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "admin_all_blog" ON public.blog_posts
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Services: public read published
CREATE POLICY "public_read_services" ON public.services
  FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "admin_all_services" ON public.services
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Testimonials: public read published
CREATE POLICY "public_read_testimonials" ON public.testimonials
  FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "admin_all_testimonials" ON public.testimonials
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Team: public read published
CREATE POLICY "public_read_team" ON public.team_members
  FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "admin_all_team" ON public.team_members
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Quotes: anyone can insert, only admin reads
CREATE POLICY "public_insert_quotes" ON public.quote_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin_all_quotes" ON public.quote_requests
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Site settings: public read, admin write
CREATE POLICY "public_read_settings" ON public.site_settings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_all_settings" ON public.site_settings
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Grant table access
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════
--  SEED DATA
-- ═══════════════════════════════════════════════════════════

INSERT INTO public.site_settings (key, value) VALUES
  ('hero', '{"title":"Stories that move people to act.","subtitle":"We combine cinematic craft with AI-powered strategy to produce brand videos that captivate, convert, and endure.","cta_primary":"See our work","cta_secondary":"Explore services"}'),
  ('stats', '[{"num":"12+","label":"Years"},{"num":"500+","label":"Videos"},{"num":"48h","label":"Turnaround"},{"num":"98%","label":"Satisfaction"}]'),
  ('contact_info', '{"email":"hello@imbaproduction.com","phone":"","address":"007 N Orange St, 4th Floor Suite #3601, Wilmington, Delaware 19801"}'),
  ('seo', '{"title":"Imba Production — Next-Gen Video for Brands","description":"Cinematic video production powered by AI strategy. Brand films, product videos, AI campaigns, drone, and social content.","og_image":""}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.services (name, slug, tagline, description, icon_key, sort_order, published) VALUES
  ('Brand & Commercial Video', 'brand-commercial', 'Cinematic brand films and TV-quality spots', 'We create brand films and commercial video that elevate your identity across every channel.', 'video', 0, true),
  ('AI-Powered Video', 'ai-video', 'Human creativity, machine speed', 'Hyper-personalised, AI-generated campaigns that scale content production without sacrificing quality.', 'ai', 1, true),
  ('Product & Ecommerce Video', 'product-ecommerce', 'Videos that sell', 'Conversion-focused product videos and cooking content designed to stop the scroll and drive purchases.', 'product', 2, true),
  ('Short & Social Video', 'short-social', 'Native to every algorithm', 'TikTok, Instagram Reels, and YouTube Shorts — natively-crafted vertical content.', 'social', 3, true),
  ('Post Production', 'post-production', 'Full-service editing & finishing', 'Edit, colour grade, motion graphics, and sound design from our in-house studio.', 'post', 4, true),
  ('Drone & Aerial', 'drone-aerial', 'Licensed aerial cinematography', 'Stunning aerial footage for events, real estate, sports, and outdoor brands.', 'drone', 5, true),
  ('eLearning Video', 'elearning', 'Training that engages', 'Professional eLearning and corporate training video production at any scale.', 'elearning', 6, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.testimonials (client_name, client_role, client_company, text, rating, featured, published) VALUES
  ('Sarah Andersen', 'CMO', 'FoodCo International', 'Imba Production transformed how we present our brand online. The cooking series they produced generated 3× more traffic than any previous content.', 5, true, true),
  ('Marco Kessler', 'Growth Lead', 'NordShop', 'The AI video campaign was something we had never seen from a production house. Personalisation at scale reduced our CPA by 40%.', 5, false, true),
  ('Julia Larsson', 'Founder', 'Velour Boutique', 'Professional, fast, and genuinely creative. Full product video suite delivered in 48 hours. The team at Imba is exceptional.', 5, false, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.portfolio_items (title, slug, category, client_name, description, results, featured, published, sort_order) VALUES
  ('Cooking Heritage Campaign', 'cooking-heritage', 'brand', 'FoodCo International', 'A cinematic brand film series celebrating culinary heritage.', '{"views":"4.2M","ctr":"↑38%"}', true, true, 0),
  ('FashionTech Reel', 'fashiontech-reel', 'ai', 'NordShop', 'AI-generated fashion campaign with personalised variants.', '{"variants":"2,400","cpa":"↓40%"}', false, true, 1),
  ('Coastal Estate Cinematic Tour', 'coastal-estate', 'drone', 'Prime Real Estate', 'Aerial cinematography showcase for luxury property.', '{"views":"890K"}', false, true, 2),
  ('Ecommerce Product Spot', 'ecommerce-spot', 'product', 'Velour Boutique', 'Product video suite for ecommerce launch.', '{"conversion":"↑22%"}', false, true, 3),
  ('TikTok Series Season 1', 'tiktok-series', 'social', 'BrandX', '12-episode vertical content series for TikTok.', '{"views":"12M","followers":"↑85K"}', false, true, 4)
ON CONFLICT (slug) DO NOTHING;
