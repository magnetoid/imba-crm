-- ═════════════════════════════════════════════════════════════════════════
--  20260423_cost_caps.sql
--  Adds AI cost control settings to crm_runtime_settings.
-- ═════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'crm_runtime_settings') then
    alter table public.crm_runtime_settings
      add column if not exists ai_monthly_cap_cents integer default 50000,
      add column if not exists ai_soft_cap_cents integer default 35000,
      add column if not exists ai_cap_action text default 'block' check (ai_cap_action in ('block', 'downgrade', 'require_approval'));
  end if;
end $$;

commit;