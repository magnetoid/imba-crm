-- ═════════════════════════════════════════════════════════════════════════
--  20260605_thread_last_direction.sql
--
--  "Needs reply" filter fix.
--
--  Previously the SPA defined "needs reply" as has_inbound AND unread > 0.
--  That conflates *unread* with *not yet replied to* — if you READ the
--  message but haven't replied, it falls out of the filter, which is the
--  exact case where you most want it visible. The correct semantic is:
--    a thread "needs reply" when the LAST message in it is inbound.
--
--  Adds last_direction to crm_inbox_threads and replies-pending boolean
--  for cheap UI filtering. Drops + recreates the view (same shape as
--  20260604, plus the new columns).
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

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
  -- last_direction: 'inbound' / 'outbound' — derived from the row with
  -- the maximum received_at. Used by the SPA to flag "needs reply" =
  -- last_direction = 'inbound'.
  (array_agg(direction order by received_at desc))[1]                                               as last_direction,
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
