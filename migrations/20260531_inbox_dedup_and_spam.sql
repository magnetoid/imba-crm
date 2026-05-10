-- ═════════════════════════════════════════════════════════════════════════
--  20260531_inbox_dedup_and_spam.sql
--
--  Two production hotfixes for the Inbox flood:
--
--  1. Deduplicate the 6000+ Sony / newsletter / etc rows that landed
--     because insertInboxMessage in the worker didn't check Message-ID.
--     We keep the oldest row per (message_id) — and as a fallback for
--     emails without a message_id, the oldest per (from_email, subject,
--     received_at).
--
--  2. Add a unique index on Message-ID so re-polls and worker restarts
--     can never cause this again. The worker code will be updated to
--     do INSERT ... ON CONFLICT DO NOTHING.
--
--  3. Add `crm_inbox_skip_senders` — a list of from-address patterns
--     the IMAP puller drops on the floor. Seeded with the obvious
--     marketing-newsletter offenders the user is seeing today.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. De-duplicate by Message-ID first ──────────────────────────────
-- Keep the row with the smallest id (oldest) per message_id.
with dups as (
  select id,
         row_number() over (
           partition by (metadata->>'message_id')
           order by received_at, id
         ) as rn
    from public.crm_inbox_messages
   where metadata ? 'message_id'
     and (metadata->>'message_id') is not null
     and length(metadata->>'message_id') > 0
)
delete from public.crm_inbox_messages
 where id in (select id from dups where rn > 1);

-- ── 2. Then de-duplicate the no-message-id stragglers by (from_email,
--    subject, received_at) — same email arrived 3× within milliseconds.
with dups2 as (
  select id,
         row_number() over (
           partition by from_email, subject, received_at
           order by id
         ) as rn
    from public.crm_inbox_messages
   where not (metadata ? 'message_id')
      or (metadata->>'message_id') is null
      or length(metadata->>'message_id') = 0
)
delete from public.crm_inbox_messages
 where id in (select id from dups2 where rn > 1);

-- ── 3. Add the unique index. Postgres lets you index a jsonb expression. ──
-- WHERE clause makes it partial — null message_ids are allowed
-- (handled by the dedup step above).
create unique index if not exists crm_inbox_messages_message_id_unique
  on public.crm_inbox_messages ((metadata->>'message_id'))
  where (metadata->>'message_id') is not null
    and length(metadata->>'message_id') > 0;

-- ── 4. Skip-sender list (newsletter / no-reply / etc) ────────────────
create table if not exists public.crm_inbox_skip_senders (
  id            uuid primary key default uuid_generate_v4(),
  pattern       text not null,         -- substring match against from_email (lowercase). E.g. "@email.sel.sony.com" or "no-reply@".
  reason        text,
  hit_count     int default 0,
  created_at    timestamptz default now()
);

-- Unique on the raw pattern so ON CONFLICT (pattern) works on seeds.
-- We lowercase on the read side (see worker loadSkipSenders).
create unique index if not exists crm_inbox_skip_senders_pattern_uidx
  on public.crm_inbox_skip_senders (pattern);

alter table public.crm_inbox_skip_senders enable row level security;

drop policy if exists crm_inbox_skip_senders_read on public.crm_inbox_skip_senders;
create policy crm_inbox_skip_senders_read on public.crm_inbox_skip_senders
  for select to authenticated, service_role using (true);

drop policy if exists crm_inbox_skip_senders_write on public.crm_inbox_skip_senders;
create policy crm_inbox_skip_senders_write on public.crm_inbox_skip_senders
  for all to authenticated using (true) with check (true);

drop policy if exists crm_inbox_skip_senders_service on public.crm_inbox_skip_senders;
create policy crm_inbox_skip_senders_service on public.crm_inbox_skip_senders
  for all to service_role using (true) with check (true);

-- Seed common marketing-newsletter senders the user is already seeing.
insert into public.crm_inbox_skip_senders (pattern, reason) values
  ('@email.sel.sony.com',      'Sony Electronics newsletter'),
  ('no-reply@',                'Generic no-reply notifications'),
  ('noreply@',                 'Generic no-reply notifications'),
  ('mailer-daemon@',           'Bounce postmaster'),
  ('postmaster@',              'Postmaster notifications'),
  ('@notifications.',          'Generic notifications subdomain'),
  ('@email.',                  'Marketing email subdomain — review and remove if too broad'),
  ('@news.',                   'Newsletter subdomain'),
  ('@newsletter.',             'Newsletter subdomain'),
  ('@reply.',                  'Reply-address subdomain'),
  ('@notify.',                 'Notify subdomain'),
  ('@updates.',                'Updates / digest subdomain'),
  ('@marketing.',              'Marketing subdomain'),
  ('@ihs.com.tr',              'TR domain registrar bulk notifications'),
  ('-bounce@',                 'Bounce envelope sender')
on conflict (pattern) do nothing;

-- ── 5. Cleanup: delete already-ingested messages from skip-sender
--    domains so the Inbox UI is usable right now.
with skipped as (
  delete from public.crm_inbox_messages m
   using public.crm_inbox_skip_senders s
   where m.from_email is not null
     and lower(m.from_email) like '%' || lower(s.pattern) || '%'
   returning s.id as skip_sender_id
)
update public.crm_inbox_skip_senders s
   set hit_count = s.hit_count + (
     select count(*) from skipped where skip_sender_id = s.id
   );

commit;
