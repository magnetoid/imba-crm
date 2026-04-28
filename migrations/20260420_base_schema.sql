-- ═════════════════════════════════════════════════════════════════════════
--  20260420_base_schema.sql
--
--  Base CRM schema — runs BEFORE 20260421_split_provider_secrets.sql.
--  Creates the tables/RPCs that the SPA expects but that aren't in the
--  imbaproduction-web-app legacy init.sql we cloned the rest of the
--  schema from:
--
--    - public.crm_runtime_settings   (singleton id=1 with AI/SMTP/IMAP config)
--    - public.crm_templates          (email/follow_up/proposal templates)
--    - public.is_admin()             (used by other migrations' RLS guards)
--
--  Idempotent — safe to rerun.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- uuid_generate_v4 / gen_random_uuid are already provided by the
-- supabase/postgres image (or by the legacy schema clone). Don't try to
-- (re)install the extensions — that fails if the function names already
-- exist in pg_proc, and we don't actually need to own them.

-- ── is_admin() ──────────────────────────────────────────────────────────
-- True if the calling JWT has app_metadata.role = 'admin' or user_metadata.role = 'admin'.
-- Used by 20260421_split_provider_secrets.sql in set_provider_credential().
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ── crm_runtime_settings (singleton, id=1) ──────────────────────────────
create table if not exists public.crm_runtime_settings (
  id int primary key default 1,

  -- AI provider routing
  active_ai_provider text default 'anthropic'
    check (active_ai_provider in ('anthropic','openai','gemini','perplexity','ollama')),
  active_ai_model text default 'claude-sonnet-4-20250514',
  anthropic_model text default 'claude-sonnet-4-20250514',
  anthropic_models jsonb default '[]'::jsonb,
  anthropic_temperature numeric default 0.2,
  openai_model text default 'gpt-4o-mini',
  openai_models jsonb default '[]'::jsonb,
  gemini_model text default 'gemini-2.5-flash',
  gemini_models jsonb default '[]'::jsonb,
  perplexity_model text default 'sonar',
  perplexity_models jsonb default '[]'::jsonb,
  ollama_base_url text default 'http://host.docker.internal:11434',
  ollama_model text default 'llama3.1',
  ollama_models jsonb default '[]'::jsonb,

  -- Outbound email (SMTP)
  smtp_host text default '',
  smtp_port text default '587',
  smtp_secure boolean default false,
  smtp_username text default '',
  smtp_from_name text default 'Imba Production',
  smtp_from_email text default '',

  -- Inbound email (IMAP) — for CRM Inbox to pull messages
  imap_enabled boolean default false,
  imap_host text default '',
  imap_port text default '993',
  imap_secure boolean default true,
  imap_username text default '',
  imap_folder text default 'INBOX',
  imap_poll_seconds int default 60,
  imap_last_uid bigint default 0,
  imap_last_synced_at timestamptz,

  -- Inbound email (POP3) — alternative to IMAP
  pop3_enabled boolean default false,
  pop3_host text default '',
  pop3_port text default '995',
  pop3_secure boolean default true,
  pop3_username text default '',
  pop3_leave_on_server boolean default true,
  pop3_last_uidl text default '',
  pop3_last_synced_at timestamptz,

  -- Outreach behaviour
  ai_outreach_tone text default 'professional',
  ai_auto_enrich boolean default true,
  ai_inbox_auto_categorize boolean default true,

  -- Company context the AI uses in prompts
  company_name text default '',
  company_description text default '',
  usp text default '',
  scheduling_url text default '',

  lead_sources_enabled jsonb default '[]'::jsonb,
  outreach_daily_limit int default 50,

  -- Cost caps (also touched by 20260423_cost_caps.sql, kept idempotent)
  ai_monthly_cap_cents int default 0,
  ai_soft_cap_cents int default 0,
  ai_cap_action text default 'require_approval'
    check (ai_cap_action in ('block','downgrade','require_approval')),

  auto_score_on_import boolean default false,
  auto_invoice_on_won boolean default false,
  auto_won_on_proposal_signed boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One-row table — seed the singleton.
insert into public.crm_runtime_settings (id)
  values (1)
  on conflict (id) do nothing;

alter table public.crm_runtime_settings enable row level security;

drop policy if exists "anyone reads runtime settings" on public.crm_runtime_settings;
create policy "anyone reads runtime settings" on public.crm_runtime_settings
  for select to anon, authenticated using (true);

drop policy if exists "authenticated writes runtime settings" on public.crm_runtime_settings;
create policy "authenticated writes runtime settings" on public.crm_runtime_settings
  for all to authenticated using (true) with check (true);

drop policy if exists "service role full access" on public.crm_runtime_settings;
create policy "service role full access" on public.crm_runtime_settings
  for all to service_role using (true) with check (true);

-- ── crm_templates ───────────────────────────────────────────────────────
create table if not exists public.crm_templates (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('email','follow_up','proposal','sms')),
  name text not null,
  subject text,
  content text not null,
  variables text[] default '{}',
  ai_generated boolean default false,
  use_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists crm_templates_type_idx on public.crm_templates (type);

alter table public.crm_templates enable row level security;

drop policy if exists "authenticated read templates" on public.crm_templates;
create policy "authenticated read templates" on public.crm_templates
  for select to authenticated, service_role using (true);

drop policy if exists "authenticated writes templates" on public.crm_templates;
create policy "authenticated writes templates" on public.crm_templates
  for all to authenticated using (true) with check (true);

drop policy if exists "service role full access templates" on public.crm_templates;
create policy "service role full access templates" on public.crm_templates
  for all to service_role using (true) with check (true);

commit;
