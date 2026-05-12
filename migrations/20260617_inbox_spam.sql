-- ═════════════════════════════════════════════════════════════════════════
--  20260617_inbox_spam.sql
--
--  Adds the spam folder. Distinct from the existing crm_inbox_skip_senders
--  list (which DROPS messages on insert) — this one keeps the message but
--  shunts it into a Spam tab the operator can review + recover from.
--
--  Two signals set is_spam=true:
--    1. The AI categorizer returns ai_category='spam' / 'promotional' /
--       'newsletter' (handled in code).
--    2. The operator clicks "Mark spam" in the Inbox UI (also adds the
--       sender to crm_inbox_skip_senders so future mail from them never
--       even reaches the spam tab).
--
--  The crm_inbox_threads view picks up has_spam so the UI can split the
--  Spam tab cleanly.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_inbox_messages
  add column if not exists is_spam boolean not null default false;

create index if not exists crm_inbox_messages_is_spam_idx
  on public.crm_inbox_messages (is_spam) where is_spam = true;

-- Rebuild the threads view to include has_spam so the SPA can filter
-- the Spam tab without re-reading messages.
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
  bool_or(is_spam)                                                                                  as has_spam,
  (array_agg(direction   order by received_at desc))[1]                                             as last_direction,
  (array_agg(from_email  order by received_at desc) filter (where direction = 'inbound'))[1]         as last_from_email,
  (array_agg(lead_id     order by received_at asc)  filter (where lead_id is not null))[1]          as first_lead_id,
  (array_agg(ai_category order by received_at desc) filter (where ai_category is not null))[1]     as latest_ai_category,
  (array_agg(ai_sentiment order by received_at desc) filter (where ai_sentiment is not null))[1]   as latest_ai_sentiment,
  bool_or(coalesce(snoozed_until, now() - interval '1 day') > now())                                as is_snoozed
from ranked r
group by thread_key
having bool_or(direction = 'inbound') = true;

grant select on public.crm_inbox_threads to authenticated, service_role;

commit;
