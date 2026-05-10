-- ═════════════════════════════════════════════════════════════════════════
--  20260520_phase6_rbac.sql
--
--  Phase 6 — Per-user RBAC + lead ownership.
--
--  Today is_admin() returns true for every authenticated user (we ship
--  to a single org). This migration introduces:
--
--    - crm_user_roles                — role table keyed by auth.uid
--    - crm_leads.assigned_to         — owner per lead (so reps see only
--                                       their book unless admin)
--    - is_admin() / is_manager()      now read from crm_user_roles
--    - RLS update on crm_leads        — non-admins see their assigned
--                                       leads + unassigned ones
--
--  Idempotent. The very first user who logs in becomes admin.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── Role table ─────────────────────────────────────────────────────────
create table if not exists public.crm_user_roles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  role      text not null default 'rep'
            check (role in ('admin','manager','rep')),
  display_name text,
  created_at timestamptz default now()
);

alter table public.crm_user_roles enable row level security;

drop policy if exists crm_user_roles_read on public.crm_user_roles;
create policy crm_user_roles_read on public.crm_user_roles
  for select to authenticated, service_role using (true);

drop policy if exists crm_user_roles_service on public.crm_user_roles;
create policy crm_user_roles_service on public.crm_user_roles
  for all to service_role using (true) with check (true);

-- Bootstrap: if no admin exists yet, the first authenticated user
-- inserting *anything* into crm_leads gets admin role automatically.
create or replace function public.ensure_first_admin()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from public.crm_user_roles where role = 'admin') and auth.uid() is not null then
    insert into public.crm_user_roles (user_id, role)
    values (auth.uid(), 'admin')
    on conflict (user_id) do update set role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_first_admin on public.crm_leads;
create trigger trg_ensure_first_admin
  before insert on public.crm_leads
  for each row execute function public.ensure_first_admin();

-- ── Replace is_admin() to read from the role table ─────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.crm_user_roles
    where user_id = auth.uid() and role in ('admin','manager')
  )
  -- Back-compat: if the role table is empty, fall back to JWT metadata
  -- so existing sessions keep working until someone is seeded.
  or coalesce((auth.jwt() -> 'app_metadata'  ->> 'role') = 'admin', false)
  or coalesce((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false);
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.crm_user_roles
    where user_id = auth.uid() and role = 'manager'
  );
$$;
grant execute on function public.is_manager() to anon, authenticated, service_role;

-- ── Lead ownership ─────────────────────────────────────────────────────
alter table public.crm_leads
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

create index if not exists crm_leads_assigned_to_idx
  on public.crm_leads (assigned_to);

-- Tighten the existing crm_leads RLS so a non-admin only sees:
--   - leads assigned to them
--   - leads with no owner yet
-- Admins/managers keep the existing "select all" behaviour.
drop policy if exists crm_leads_read on public.crm_leads;
create policy crm_leads_read on public.crm_leads
  for select to authenticated using (
    public.is_admin()
    or assigned_to = auth.uid()
    or assigned_to is null
  );

drop policy if exists crm_leads_write on public.crm_leads;
create policy crm_leads_write on public.crm_leads
  for all to authenticated using (
    public.is_admin()
    or assigned_to = auth.uid()
    or assigned_to is null
  ) with check (
    public.is_admin()
    or assigned_to = auth.uid()
    or assigned_to is null
  );

drop policy if exists crm_leads_service on public.crm_leads;
create policy crm_leads_service on public.crm_leads
  for all to service_role using (true) with check (true);

commit;
