-- ═════════════════════════════════════════════════════════════════════════
--  20260616_inbox_dedup_no_message_id.sql
--
--  Operator reported "1052 repeated emails in inbox". Root cause:
--
--    1052 inbound rows from christina@topmagnet.com with subject="New
--    inquiry", all inserted at the same second (2026-05-11 12:14:50),
--    none with a Message-ID header. A forwarder (Plesk SMTP relay /
--    contact-form webhook?) fired the same payload 1052 times. The
--    existing unique index on (metadata->>'message_id') couldn't help
--    because Message-ID was null. The previous fallback in migration
--    20260531 only deduped EXISTING rows, didn't prevent future ones.
--
--  This migration:
--    A. Collapses every duplicate cluster (same from_email + subject +
--       received_at) down to the row with the smallest id, keeping
--       activity_timeline / thread continuity intact.
--    B. Adds a second partial unique index covering the no-message-id
--       case: (from_email, subject, received_at) when message_id is
--       null. The next forwarder spike gets ON-CONFLICT rejected.
--    C. Updates insertInboxMessage to catch BOTH unique violations
--       (handled in code in a follow-up commit — this migration just
--       lays the schema).
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── A. Collapse existing duplicates ─────────────────────────────────
-- Keep the smallest-id row per (from_email, subject, received_at)
-- cluster, where the cluster has no Message-ID. Delete the rest.
with dupes as (
  select id,
         row_number() over (
           partition by from_email, subject, received_at
           order by id
         ) as rn
    from public.crm_inbox_messages
   where direction = 'inbound'
     and (
       metadata->>'message_id' is null
       or metadata->>'message_id' = ''
     )
     and from_email is not null
     and received_at is not null
)
delete from public.crm_inbox_messages
 where id in (select id from dupes where rn > 1);

-- ── A.1 Fix missing column: crm_agent_jobs.updated_at ────────────────
-- Sprint-2 stuck-job sweeper + approval heartbeat both reference this
-- column. It was never created, so every sweep was failing with
-- "column crm_agent_jobs.updated_at does not exist" and stalled jobs
-- accumulated. Add the column + a trigger so any row UPDATE refreshes
-- it (matching the convention used elsewhere in the schema).
alter table public.crm_agent_jobs
  add column if not exists updated_at timestamptz default now();

-- Backfill existing rows so the sweeper doesn't immediately mark them
-- all stalled (15 min cutoff vs null updated_at).
update public.crm_agent_jobs
   set updated_at = coalesce(started_at, finished_at, created_at, now())
 where updated_at is null;

-- Auto-touch on UPDATE — generic trigger pattern.
create or replace function public.touch_crm_agent_jobs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_crm_agent_jobs_updated_at on public.crm_agent_jobs;
create trigger trg_crm_agent_jobs_updated_at
  before update on public.crm_agent_jobs
  for each row execute function public.touch_crm_agent_jobs_updated_at();

-- ── B. Prevent recurrence: partial unique index ─────────────────────
-- Covers the "no Message-ID" path. (from_email, subject, received_at)
-- is unique only when message_id is null — proper threaded mail (with
-- a real Message-ID) still uses the separate index from 20260531.
create unique index if not exists crm_inbox_messages_no_msgid_dedup_uidx
  on public.crm_inbox_messages (from_email, subject, received_at)
  where direction = 'inbound'
    and (metadata->>'message_id' is null or metadata->>'message_id' = '')
    and from_email is not null
    and received_at is not null;

commit;
