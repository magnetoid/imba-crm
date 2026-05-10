-- ═════════════════════════════════════════════════════════════════════════
--  20260523_fix_rbac_bootstrap.sql
--
--  Fix: the is_admin() function added in 20260520_phase6_rbac.sql reads
--  from crm_user_roles, which is empty until somebody inserts a lead
--  (the only path that fires the seed trigger). That left a fresh
--  install with NO admin → set_provider_credential() rejects every
--  Settings save with 403 → Edge Function returns non-2xx.
--
--  Two repairs:
--   1. Backfill: any existing auth.users row with no crm_user_roles
--      entry becomes admin. Single-org install, the very first user IS
--      the admin by definition.
--   2. Make the bootstrap trigger fire when the user calls
--      set_provider_credential() (and any other admin-gated RPC) so it
--      can never recur on a future fresh install.
--
--  Also tightens is_admin() so the "no admin yet" fallback is explicit
--  and visible: if zero admin rows exist AND auth.uid() is set, the
--  caller is treated as admin (and seeded). After the first admin
--  exists, normal role-table semantics take over.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Backfill existing users as admin ───────────────────────────────
insert into public.crm_user_roles (user_id, role)
select u.id, 'admin'
  from auth.users u
  left join public.crm_user_roles r on r.user_id = u.id
 where r.user_id is null;

-- ── 2. Bootstrap-on-call helper ────────────────────────────────────────
-- Promotes the calling auth.uid() to admin when the role table is empty.
-- Safe to call from anywhere; cheap.
create or replace function public.maybe_bootstrap_admin()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.crm_user_roles where role = 'admin') then
    insert into public.crm_user_roles (user_id, role)
    values (auth.uid(), 'admin')
    on conflict (user_id) do update set role = 'admin';
  end if;
end;
$$;
grant execute on function public.maybe_bootstrap_admin() to authenticated;

-- ── 3. is_admin() — call the bootstrap before checking ────────────────
create or replace function public.is_admin()
returns boolean language plpgsql stable security definer set search_path = public, auth as $$
begin
  -- One-shot self-promotion if the org has no admin yet.
  if not exists (select 1 from public.crm_user_roles where role = 'admin')
     and auth.uid() is not null then
    insert into public.crm_user_roles (user_id, role)
    values (auth.uid(), 'admin')
    on conflict (user_id) do update set role = 'admin';
    return true;
  end if;

  return exists (
    select 1 from public.crm_user_roles
    where user_id = auth.uid() and role in ('admin','manager')
  )
  or coalesce((auth.jwt() -> 'app_metadata'  ->> 'role') = 'admin', false)
  or coalesce((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false);
end;
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

commit;
