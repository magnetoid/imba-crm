-- ═════════════════════════════════════════════════════════════════════════
--  20260604_inbox_inbound_only.sql
--
--  Two related problems:
--
--   1. Legacy auto-replier pollution. A removed-from-codebase auto-reply
--      feature inserted 6,927 outbound rows into crm_inbox_messages with
--      metadata = {"is_auto_reply": true, "original_message_id": "…"} and
--      body = "Thank you for reaching out to Imba Marketing! …".
--      Most of them were a runaway loop: 728 to hello@imbaproduction.com
--      (replying to ourselves), 382 to Sony, and so on. The code path no
--      longer exists, but the rows do — and 20260603 split them into
--      unique singleton threads, so the operator now sees thousands of
--      identical "Thank you for reaching out…" threads.
--
--   2. Pure-outbound singleton threads have no business in the Inbox
--      list. An "Inbox" is *received* mail. The thread view was grouping
--      by thread_key including outbound-only thread_keys, so any future
--      orphan outbound row would re-pollute the same way.
--
--  Fix:
--    A. Delete legacy is_auto_reply rows.
--    B. Replace crm_inbox_threads to only surface thread_keys that have
--       at least one inbound message. Outbound rows still render inside
--       a thread when the operator clicks it (Inbox.tsx queries
--       crm_inbox_messages by thread_key directly) — they just don't
--       create their own list entries.
--
--  Idempotent. Safe to rerun.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── A. Delete legacy auto-replier pollution ──────────────────────────
-- Match on the metadata marker, not the body text — the body could be
-- legitimate operator-typed text on another row; the marker is the
-- diagnostic signal.
delete from public.crm_inbox_messages
 where direction = 'outbound'
   and metadata ? 'is_auto_reply'
   and (metadata->>'is_auto_reply')::boolean = true;

-- ── B. Rebuild crm_inbox_threads to require at least one inbound row ─
-- The view returns one row per thread_key, same shape as before, but
-- a thread is now defined as "a key that has an inbound message".
drop view if exists public.crm_inbox_threads cascade;
create or replace view public.crm_inbox_threads as
with ranked as (
  select
    m.*,
    row_number() over (partition by thread_key order by received_at desc) as rn_latest,
    row_number() over (partition by thread_key order by received_at asc)  as rn_earliest
  from public.crm_inbox_messages m
  where thread_key is not null
)
select
  thread_key,
  (select coalesce(
     (select subject from public.crm_inbox_messages
       where thread_key = r.thread_key
         and subject is not null
       order by received_at desc limit 1),
     'No subject')) as subject,
  max(received_at)                                                                                  as last_message_at,
  min(received_at)                                                                                  as first_message_at,
  count(*)::int                                                                                     as message_count,
  count(*) filter (where status = 'unread')::int                                                    as unread_count,
  bool_or(direction = 'inbound')                                                                    as has_inbound,
  (array_agg(from_email order by received_at desc) filter (where direction = 'inbound'))[1]         as last_from_email,
  (array_agg(lead_id     order by received_at asc)  filter (where lead_id is not null))[1]          as first_lead_id,
  (array_agg(ai_category order by received_at desc) filter (where ai_category is not null))[1]     as latest_ai_category,
  (array_agg(ai_sentiment order by received_at desc) filter (where ai_sentiment is not null))[1]   as latest_ai_sentiment,
  bool_or(coalesce(snoozed_until, now() - interval '1 day') > now())                                as is_snoozed
from ranked r
group by thread_key
having bool_or(direction = 'inbound') = true;

grant select on public.crm_inbox_threads to authenticated, service_role;

commit;
