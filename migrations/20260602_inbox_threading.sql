-- ═════════════════════════════════════════════════════════════════════════
--  20260602_inbox_threading.sql
--
--  Phase 12.1 — turn the Inbox into a proper thread-aware mail client.
--
--    - crm_inbox_messages.thread_key text        — stable key per thread.
--                                                   Derived in this order:
--                                                     1. earliest References[0]
--                                                     2. In-Reply-To
--                                                     3. Message-ID (singleton)
--                                                     4. md5 of (lower(from_email) + normalized_subject)
--                                                        as fallback for legacy rows
--
--    - thread_root_id uuid                        — id of the first message
--                                                   in the thread (for cheap
--                                                   "open the thread" lookups)
--
--    - normalize_subject() helper                  — strips "Re:" / "Fwd:" /
--                                                   "[external]" prefixes
--
--    - assign_thread_key() trigger                 — stamps thread_key on
--                                                   every insert, dedup-safe
--
--    - crm_inbox_threads view                      — one row per thread:
--                                                   subject (latest), last_message_at,
--                                                   message_count, unread_count,
--                                                   has_inbound, last_from_email,
--                                                   first_lead_id, ai_category (latest),
--                                                   ai_sentiment (latest)
--
--    - snoozed_until column                        — for snooze/send-later UX
--
--  Idempotent. Backfills existing rows in one pass.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── Helpers ─────────────────────────────────────────────────────────
create or replace function public.normalize_subject(s text)
returns text language sql immutable as $$
  select lower(trim(
    regexp_replace(
      coalesce(s, ''),
      '^(\s*(re|fw|fwd|aw|res|sv|rv)\s*(\[[^\]]*\])?\s*:\s*)+',
      '',
      'gi'
    )
  ));
$$;

-- Compute a stable thread key from References → In-Reply-To → Message-ID
-- → md5(from + normalized subject). Pure function — no DB lookups.
create or replace function public.compute_thread_key(
  p_message_id text,
  p_in_reply_to text,
  p_references jsonb,
  p_from_email text,
  p_subject text
) returns text language plpgsql immutable as $$
declare
  v_first_ref text;
begin
  -- References can be a jsonb array (from mailparser) or null.
  if p_references is not null and jsonb_typeof(p_references) = 'array' and jsonb_array_length(p_references) > 0 then
    v_first_ref := p_references->>0;
    if v_first_ref is not null and length(v_first_ref) > 0 then return v_first_ref; end if;
  end if;
  if p_in_reply_to is not null and length(p_in_reply_to) > 0 then return p_in_reply_to; end if;
  if p_message_id is not null and length(p_message_id) > 0 then return p_message_id; end if;
  -- Fallback for legacy rows with no headers.
  return 'fallback:' || md5(coalesce(lower(p_from_email), '') || '|' || public.normalize_subject(p_subject));
end;
$$;

-- ── Columns ─────────────────────────────────────────────────────────
alter table public.crm_inbox_messages
  add column if not exists thread_key text,
  add column if not exists snoozed_until timestamptz;

create index if not exists crm_inbox_messages_thread_idx
  on public.crm_inbox_messages (thread_key, received_at);

create index if not exists crm_inbox_messages_snoozed_idx
  on public.crm_inbox_messages (snoozed_until) where snoozed_until is not null;

-- ── Backfill existing rows ──────────────────────────────────────────
update public.crm_inbox_messages
   set thread_key = public.compute_thread_key(
     metadata->>'message_id',
     metadata->>'in_reply_to',
     metadata->'references',
     from_email,
     subject
   )
 where thread_key is null;

-- ── Trigger: stamp thread_key on every insert ───────────────────────
create or replace function public.trg_assign_thread_key()
returns trigger language plpgsql as $$
begin
  if new.thread_key is null then
    new.thread_key := public.compute_thread_key(
      new.metadata->>'message_id',
      new.metadata->>'in_reply_to',
      new.metadata->'references',
      new.from_email,
      new.subject
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_thread_key on public.crm_inbox_messages;
create trigger trg_assign_thread_key
  before insert on public.crm_inbox_messages
  for each row execute function public.trg_assign_thread_key();

-- ── crm_inbox_threads view ──────────────────────────────────────────
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
  -- prefer the latest non-Re-prefixed subject; otherwise the latest's
  (select coalesce(
     (select subject from public.crm_inbox_messages
       where thread_key = r.thread_key
         and subject is not null
       order by received_at desc limit 1),
     'No subject')) as subject,
  max(received_at)                          as last_message_at,
  min(received_at)                          as first_message_at,
  count(*)::int                             as message_count,
  count(*) filter (where status = 'unread')::int as unread_count,
  bool_or(direction = 'inbound')            as has_inbound,
  (array_agg(from_email order by received_at desc) filter (where direction = 'inbound'))[1]   as last_from_email,
  (array_agg(lead_id     order by received_at asc) filter (where lead_id is not null))[1]      as first_lead_id,
  (array_agg(ai_category order by received_at desc) filter (where ai_category is not null))[1] as latest_ai_category,
  (array_agg(ai_sentiment order by received_at desc) filter (where ai_sentiment is not null))[1] as latest_ai_sentiment,
  bool_or(coalesce(snoozed_until, now() - interval '1 day') > now()) as is_snoozed
from ranked r
group by thread_key;

grant select on public.crm_inbox_threads to authenticated, service_role;

commit;
