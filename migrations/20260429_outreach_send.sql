-- ═════════════════════════════════════════════════════════════════════════
--  20260429_outreach_send.sql
--
--  Make crm_outreach_emails.tracking_id auto-populate on insert so
--  the send-email worker doesn't have to round-trip to mint one.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- Backfill any nulls with new uuids so the column can carry a default safely.
update public.crm_outreach_emails
set tracking_id = uuid_generate_v4()::text
where tracking_id is null;

alter table public.crm_outreach_emails
  alter column tracking_id set default uuid_generate_v4()::text;

alter table public.crm_outreach_emails
  alter column tracking_id set not null;

commit;
