-- ═════════════════════════════════════════════════════════════════════════
--  20260421_split_provider_secrets.sql
--  Stop exposing AI provider API keys + SMTP password to the browser.
--
--  Problem before this migration:
--    - `crm_runtime_settings` is SELECTed by the admin UI on page load and
--      includes columns like `anthropic_api_key`, `openai_api_key`, ...,
--      `smtp_password`. Any admin session can read every secret.
--
--  Shape after this migration:
--    - `crm_runtime_settings` keeps only non-secret config (active provider,
--      temperatures, tone, toggles, company context, SMTP host/user, etc).
--    - `crm_provider_credentials` holds secrets in a separate table that is
--      only readable by the service_role (Edge Functions). The admin UI
--      sees a read-only view `crm_provider_credentials_status` that exposes
--      `has_key: boolean` + `updated_at` only.
--    - A SECURITY DEFINER function `set_provider_credential(provider, key)`
--      lets authenticated admins write a new key without reading the old one.
--
--  Deployment plan:
--    1. Run this migration (idempotent; safe to rerun).
--    2. Update the `ai-proxy` and `send-email` Edge Functions to read from
--       `crm_provider_credentials` with the service_role key.
--    3. Update packages/frontend/src/admin/crm/AISettings.tsx:
--         - Stop SELECTing `*_api_key` and `smtp_password` columns.
--         - Display `has_key` boolean + "Rotate key" button (calls the
--           set_provider_credential RPC).
--    4. Once both sides are deployed, drop the legacy key columns (section
--       4 below — commented out; uncomment in a follow-up migration when
--       you're sure nothing reads them).
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Secrets table ─────────────────────────────────────────────────────
create table if not exists public.crm_provider_credentials (
  provider text primary key
    check (provider in ('anthropic', 'openai', 'gemini', 'perplexity', 'ollama', 'smtp')),
  api_key text,
  extra jsonb default '{}'::jsonb,  -- e.g. SMTP host/port/user live here if you want
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.crm_provider_credentials enable row level security;

-- Only service_role may SELECT the actual secrets.
drop policy if exists "service role reads credentials" on public.crm_provider_credentials;
create policy "service role reads credentials" on public.crm_provider_credentials
  for select to service_role using (true);

-- No one else reads this table directly. Admins use the view + RPC below.

-- ── 2. Read-only status view for the admin UI ───────────────────────────
create or replace view public.crm_provider_credentials_status as
select
  provider,
  (api_key is not null and length(api_key) > 0) as has_key,
  updated_at,
  updated_by
from public.crm_provider_credentials;

-- View inherits RLS from the base table, so admins SELECT via a function instead.

-- ── 3. RPCs the admin UI may call ───────────────────────────────────────
-- Returns one row per provider (creates a stub if absent) so the UI can
-- iterate without knowing which providers exist yet.
create or replace function public.list_provider_credentials()
returns table (provider text, has_key boolean, updated_at timestamptz)
language sql security definer set search_path = public, auth
as $$
  select
    provider,
    (api_key is not null and length(api_key) > 0) as has_key,
    updated_at
  from public.crm_provider_credentials
  order by provider;
$$;

revoke all on function public.list_provider_credentials() from public;
grant execute on function public.list_provider_credentials() to authenticated;

-- Admin-only mutation. Requires `is_admin()` — expected to already exist,
-- referenced by packages/frontend/src/admin/utils/adminPermissions.ts.
create or replace function public.set_provider_credential(
  p_provider text,
  p_api_key text,
  p_extra jsonb default null
) returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.crm_provider_credentials (provider, api_key, extra, updated_at, updated_by)
  values (p_provider, p_api_key, coalesce(p_extra, '{}'::jsonb), now(), auth.uid())
  on conflict (provider) do update
    set api_key = excluded.api_key,
        extra = coalesce(excluded.extra, public.crm_provider_credentials.extra),
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

revoke all on function public.set_provider_credential(text, text, jsonb) from public;
grant execute on function public.set_provider_credential(text, text, jsonb) to authenticated;

-- ── 4. Optional backfill from the legacy columns (safe to rerun) ────────
-- Copies current keys out of crm_runtime_settings (id=1) so the new table
-- is populated before the UI/Edge Functions switch. The old columns stay
-- in place until you're sure nothing reads them.
do $$
declare
  row record;
begin
  select * into row from public.crm_runtime_settings where id = 1;
  if row is null then return; end if;

  if coalesce(row.anthropic_api_key, '') <> '' then
    perform public.set_provider_credential('anthropic', row.anthropic_api_key, null);
  end if;
  if coalesce(row.openai_api_key, '') <> '' then
    perform public.set_provider_credential('openai', row.openai_api_key, null);
  end if;
  if coalesce(row.gemini_api_key, '') <> '' then
    perform public.set_provider_credential('gemini', row.gemini_api_key, null);
  end if;
  if coalesce(row.perplexity_api_key, '') <> '' then
    perform public.set_provider_credential('perplexity', row.perplexity_api_key, null);
  end if;
  if coalesce(row.smtp_password, '') <> '' then
    perform public.set_provider_credential(
      'smtp',
      row.smtp_password,
      jsonb_build_object(
        'host', row.smtp_host,
        'port', row.smtp_port,
        'secure', row.smtp_secure,
        'username', row.smtp_username,
        'from_name', row.smtp_from_name,
        'from_email', row.smtp_from_email
      )
    );
  end if;
exception
  when undefined_column then
    -- The legacy column layout isn't present; nothing to backfill.
    null;
  when others then
    raise notice 'backfill skipped: %', sqlerrm;
end $$;

-- ── 5. Scrub legacy columns — run AFTER both sides are deployed ─────────
-- This is commented out on purpose. Uncomment in a FOLLOW-UP migration once
-- ai-proxy and send-email Edge Functions plus AISettings.tsx have been
-- updated to use the new table. Running it early breaks the live app.
--
-- alter table public.crm_runtime_settings
--   drop column if exists anthropic_api_key,
--   drop column if exists openai_api_key,
--   drop column if exists gemini_api_key,
--   drop column if exists perplexity_api_key,
--   drop column if exists smtp_password;

commit;
