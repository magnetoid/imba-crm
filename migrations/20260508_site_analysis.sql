-- ═════════════════════════════════════════════════════════════════════════
--  20260508_site_analysis.sql
--
--  Adds the site_analyses table for the Client Website Analyzer module.
--  Stores crawl results, AI-scored audits, and opportunity intelligence
--  linked to CRM leads.
--
--  Idempotent — safe to rerun.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── site_analyses ───────────────────────────────────────────────────────
create table if not exists public.site_analyses (
  id uuid primary key default uuid_generate_v4(),

  -- Link to lead (nullable for standalone audits)
  lead_id uuid references public.crm_leads(id) on delete set null,

  -- Target
  url text not null,
  domain text not null,

  -- Status
  status text not null default 'pending'
    check (status in ('pending','crawling','analyzing','complete','failed')),
  error text,

  -- Raw data (JSONB for flexibility as we add signals)
  tech_stack jsonb default '{}'::jsonb,
  seo_audit jsonb default '{}'::jsonb,
  performance jsonb default '{}'::jsonb,
  content_audit jsonb default '{}'::jsonb,
  visual_audit jsonb default '{}'::jsonb,
  screenshots jsonb default '[]'::jsonb,

  -- Scores (0-100)
  score_overall int,
  score_seo int,
  score_performance int,
  score_content int,
  score_visual int,

  -- AI-generated intelligence
  ai_summary text,
  ai_opportunities text,
  ai_talking_points text,
  ai_competitor_notes text,

  -- Metadata
  crawled_at timestamptz,
  analyzed_at timestamptz,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

create index if not exists site_analyses_lead_idx on public.site_analyses(lead_id);
create index if not exists site_analyses_domain_idx on public.site_analyses(domain);
create index if not exists site_analyses_status_idx on public.site_analyses(status);

-- RLS
alter table public.site_analyses enable row level security;

drop policy if exists "authenticated read site_analyses" on public.site_analyses;
create policy "authenticated read site_analyses" on public.site_analyses
  for select to authenticated, service_role using (true);

drop policy if exists "authenticated write site_analyses" on public.site_analyses;
create policy "authenticated write site_analyses" on public.site_analyses
  for all to authenticated using (true) with check (true);

drop policy if exists "service role full access site_analyses" on public.site_analyses;
create policy "service role full access site_analyses" on public.site_analyses
  for all to service_role using (true) with check (true);

commit;
