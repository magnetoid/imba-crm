-- ═════════════════════════════════════════════════════════════════════════
--  20260526_pipeline_power.sql
--
--  Phase 10.2 — Pipeline UX power features.
--
--    - crm_leads.tags text[]               — multi-select tags per lead
--    - crm_saved_views                     — per-user saved filter sets
--                                            ({stages, tags, fit_min, ...})
--    - crm_companies.research jsonb       — pre-allocated for Phase 10.4
--                                            account-researcher; nothing
--                                            reads it yet.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── Tags ─────────────────────────────────────────────────────────────
alter table public.crm_leads
  add column if not exists tags text[] default '{}'::text[];

create index if not exists crm_leads_tags_idx on public.crm_leads using gin (tags);

-- ── Account-research jsonb (pre-allocated for 10.4) ──────────────────
alter table public.crm_companies
  add column if not exists research jsonb default '{}'::jsonb,
  add column if not exists research_at timestamptz;

-- ── Saved views ──────────────────────────────────────────────────────
create table if not exists public.crm_saved_views (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade,
  name          text not null,
  filter        jsonb not null default '{}'::jsonb,  -- { stages?: text[], tags?: text[], fit_min?: int, intent_min?: int, owner?: uuid, search?: text }
  pinned        boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists crm_saved_views_user_idx on public.crm_saved_views (user_id, pinned desc, name);

alter table public.crm_saved_views enable row level security;

drop policy if exists crm_saved_views_owner_read on public.crm_saved_views;
create policy crm_saved_views_owner_read on public.crm_saved_views
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists crm_saved_views_owner_write on public.crm_saved_views;
create policy crm_saved_views_owner_write on public.crm_saved_views
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists crm_saved_views_service on public.crm_saved_views;
create policy crm_saved_views_service on public.crm_saved_views
  for all to service_role using (true) with check (true);

commit;
