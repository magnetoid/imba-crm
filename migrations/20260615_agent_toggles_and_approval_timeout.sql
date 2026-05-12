-- ═════════════════════════════════════════════════════════════════════════
--  20260615_agent_toggles_and_approval_timeout.sql
--
--  Sprint-4 operator-control additions.
--
--    crm_runtime_settings:
--      - agent_kinds_disabled  text[]   default '{}'
--          List of agent kinds the worker should refuse to run. Job is
--          marked cancelled with error='agent kind disabled by operator'.
--      - agent_approval_timeout_minutes int default 60
--          How long pollForDecision waits for approval before rejecting.
--          Default matches the previous hard-coded value; operator can
--          extend (e.g. 1440 for "wait a day").
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_runtime_settings
  add column if not exists agent_kinds_disabled text[] default '{}'::text[],
  add column if not exists agent_approval_timeout_minutes int default 60;

commit;
