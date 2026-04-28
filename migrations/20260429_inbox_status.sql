-- ═════════════════════════════════════════════════════════════════════════
--  20260429_inbox_status.sql
--
--  Surface inbox-puller health to the Settings UI: every poll cycle the
--  puller writes either *_last_success_at + clears *_last_error, or sets
--  *_last_error with a short message and timestamps it. The UI reads
--  these from crm_runtime_settings on render and shows "Polling OK 12s
--  ago" or "Last error: connect ETIMEDOUT".
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_runtime_settings
  add column if not exists imap_last_success_at timestamptz,
  add column if not exists imap_last_error      text,
  add column if not exists imap_last_error_at   timestamptz,
  add column if not exists pop3_last_success_at timestamptz,
  add column if not exists pop3_last_error      text,
  add column if not exists pop3_last_error_at   timestamptz;

commit;
