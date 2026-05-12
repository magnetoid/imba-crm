-- ═════════════════════════════════════════════════════════════════════════
--  20260614_ai_cap_state.sql
--
--  Cost-cap visibility. callAIJSON() throws "AI Cost Cap Exceeded" when
--  the monthly spend exceeds ai_monthly_cap_cents, but the failure used
--  to be silent to the operator — they'd see agents stop running and
--  not know why.
--
--  Adds:
--    - ai_cap_state jsonb on crm_runtime_settings — populated by the
--      shared/lib/ai layer the first time the cap is exceeded each
--      month. Shape:
--        { triggered_at, current_cents, cap_cents, period_start }
--    - The cap helper clears this when the period rolls or the cap
--      is raised above current spend.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_runtime_settings
  add column if not exists ai_cap_state jsonb default null;

commit;
