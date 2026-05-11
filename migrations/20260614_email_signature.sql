-- ═════════════════════════════════════════════════════════════════════════
--  20260614_email_signature.sql
--
--  Email signature management. Operator-controlled signature appended
--  to every outbound (when enabled). Stored as plain text — the SPA
--  composer can preview + edit it; send-email.ts appends it if set.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_runtime_settings
  add column if not exists email_signature text,
  add column if not exists email_signature_enabled boolean default true;

commit;
