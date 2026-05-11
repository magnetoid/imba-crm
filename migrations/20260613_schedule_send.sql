-- ═════════════════════════════════════════════════════════════════════════
--  20260613_schedule_send.sql
--
--  Schedule-send + Undo-send buffer. Two related capabilities, one column.
--
--  scheduled_for timestamptz: when set, send-email.ts ignores the row
--  until now() >= scheduled_for. Used for:
--    1. Operator-set "send Tuesday at 9 am" — long delay.
--    2. Operator-implicit "send in 15 seconds" — undo-send buffer.
--       (The SPA defaults this to now()+15s on every approved send so
--       the operator can hit the Undo toast for the next 15 seconds.)
--
--  When the operator clicks Undo within the buffer window, the SPA flips
--  the row back to status='draft' (or deletes it for new-compose).
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_outreach_emails
  add column if not exists scheduled_for timestamptz;

-- Speeds up the send-email poll's "approved AND (no schedule OR due now)" query.
create index if not exists crm_outreach_emails_scheduled_idx
  on public.crm_outreach_emails (scheduled_for)
  where status = 'approved';

-- Allow 'scheduled' as a status. The existing check constraint already
-- permits 'approved', 'sent', 'failed', 'cancelled', 'draft'; we want
-- 'scheduled' too for rows in the future-send queue (distinct from
-- 'approved + buffer'). Refresh the check constraint defensively.
do $$
begin
  if exists (
    select 1 from information_schema.check_constraints
     where constraint_schema='public' and constraint_name='crm_outreach_emails_status_check'
  ) then
    alter table public.crm_outreach_emails drop constraint crm_outreach_emails_status_check;
  end if;
exception when others then null;
end$$;

alter table public.crm_outreach_emails
  add constraint crm_outreach_emails_status_check
  check (status in ('draft', 'approved', 'scheduled', 'sent', 'failed', 'cancelled', 'bounced'));

commit;
