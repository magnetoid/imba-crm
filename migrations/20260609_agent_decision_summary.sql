-- ═════════════════════════════════════════════════════════════════════════
--  20260609_agent_decision_summary.sql
--
--  Agent explainability. Today crm_agent_runs has tool_input + tool_output
--  jsonb but no human-readable rationale. The Agents UI shows a JSON
--  dump; operators can't quickly tell why a step was taken without
--  reading the raw payload.
--
--  Adds decision_summary text — one sentence per step explaining the
--  decision in plain language. The ctx.step() wrapper accepts a summary
--  helper; each agent calls it on the steps that matter. The UI promotes
--  the summary to the primary line of the step row; tool_output JSON
--  moves under "View raw".
--
--  Examples of good summaries:
--    "Hunter returned alice@acme.com (score 94)"
--    "Drafted 142-word warm-intro referencing Series B"
--    "Skipped — no LinkedIn URL and no domain"
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_agent_runs
  add column if not exists decision_summary text;

commit;
