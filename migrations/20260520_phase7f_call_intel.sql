-- ═════════════════════════════════════════════════════════════════════════
--  20260520_phase7f_call_intel.sql
--
--  Conversation-intelligence storage. Phase 7f from the plan — captures
--  call recordings + AI-extracted "what did I miss?" coach notes.
--
--  Schema only — the worker-side `call-analyzer` agent uses these
--  columns when a Cal.com (or Whereby/Daily) recording webhook fires
--  with a media URL.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_activities
  add column if not exists recording_url   text,
  add column if not exists transcript_url  text,
  add column if not exists transcript_text text,
  add column if not exists coach_notes     jsonb default '{}'::jsonb;

-- Operator-facing index for "show me last 30d of meetings with notes".
create index if not exists crm_activities_meetings_idx
  on public.crm_activities (lead_id, created_at desc)
  where type = 'meeting';

commit;
