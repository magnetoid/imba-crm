-- ═════════════════════════════════════════════════════════════════════════
--  20260613_companies_rls_admin_write.sql
--
--  Sprint-1 security fix: crm_companies currently allows ANY authenticated
--  user to INSERT/UPDATE/DELETE rows (write policy uses `using (true)`).
--  Tighten so non-admins can only READ. Admin writes flow through the
--  existing is_admin() RPC.
--
--  Service-role writes are unaffected — the worker continues to upsert
--  companies during lead-finder runs.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- Drop any prior write policy by name. Multiple migrations may have set
-- one; this catches the common names.
drop policy if exists crm_companies_write on public.crm_companies;
drop policy if exists crm_companies_all   on public.crm_companies;
drop policy if exists crm_companies_authenticated_write on public.crm_companies;

-- Read stays open to all authenticated users.
drop policy if exists crm_companies_read on public.crm_companies;
create policy crm_companies_read on public.crm_companies
  for select to authenticated using (true);

-- Write is admin-only. is_admin() is the canonical role check defined
-- in 20260520_phase6_rbac.sql.
create policy crm_companies_admin_write on public.crm_companies
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Service-role bypass — the worker needs unrestricted writes for
-- lead-finder, account-researcher, etc.
drop policy if exists crm_companies_service on public.crm_companies;
create policy crm_companies_service on public.crm_companies
  for all to service_role using (true) with check (true);

commit;
