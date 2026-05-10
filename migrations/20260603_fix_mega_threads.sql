-- ═════════════════════════════════════════════════════════════════════════
--  20260603_fix_mega_threads.sql
--
--  Two-part fix for the Inbox "every thread shows the same content" bug.
--
--  Root cause:
--   1. compute_thread_key() falls back to md5(from_email + subject) when a
--      message has no Message-ID / In-Reply-To / References headers. For
--      auto-reply mail (e.g. our own hello@imbaproduction.com auto-responder)
--      every message has the same from + same boilerplate subject, so they
--      all hash to the SAME thread_key. Result: mega-threads of 285, 158,
--      90, 86, 77, 76 messages each, all showing the first message's body.
--
--   2. Our own auto-reply system polls back into the inbox via IMAP, so
--      hello@imbaproduction.com accounts for 563 self-sent rows — the
--      single largest sender in the dataset.
--
--  Fix:
--    A. Extend crm_inbox_skip_senders with hello@imbaproduction.com and
--       the top auto-noise senders (twitter, firstbase, woocommerce, uber,
--       etc.). Delete already-ingested rows matching them.
--    B. Rewrite compute_thread_key() so the fallback case mixes in a
--       per-message discriminator (we use a random uuid via a trigger
--       wrapper) — new auto-noise will land as singleton threads.
--    C. Split existing mega-threads: for any thread_key starting with
--       'fallback:' that has > 5 messages, give each member its own
--       unique thread_key so the Inbox UI shows one message per row.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── A. Skip more auto-noise senders ──────────────────────────────────
insert into public.crm_inbox_skip_senders (pattern, reason) values
  ('hello@imbaproduction.com', 'Our own auto-reply system looping back via IMAP'),
  ('@imbaproduction.com',      'Catch-all for any other internal auto-replies'),
  ('@twitter.com',             'Twitter notifications'),
  ('@x.com',                   'X / Twitter notifications'),
  ('@firstbase.io',            'Firstbase product notifications'),
  ('@nichedatafactory.com',    'Niche Data Factory marketing'),
  ('@medioq.com',              'Medioq marketing'),
  ('@woocommerce.com',         'WooCommerce marketing'),
  ('@productionhub.com',       'ProductionHub marketing'),
  ('@uber.com',                'Uber receipts'),
  ('@uberinternal.com',        'Uber internal'),
  ('@linkedin.com',            'LinkedIn notifications'),
  ('@github.com',              'GitHub notifications'),
  ('@stripe.com',              'Stripe receipts'),
  ('@notion.so',               'Notion notifications'),
  ('@slack.com',               'Slack notifications')
on conflict (pattern) do nothing;

-- ── A.1 Delete already-ingested rows matching the new patterns ───────
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

-- ── B. Rewrite compute_thread_key() — fallback uses per-row uniqueness ──
--    The signature stays the same so existing callers (trigger, backfill)
--    don't break. We change the fallback branch only.
--
--    Important: we mark the function VOLATILE (not immutable) because the
--    fallback now reads gen_random_uuid(). The trigger calls it once per
--    insert, so volatility is fine. The non-fallback branches are still
--    deterministic from inputs.
create or replace function public.compute_thread_key(
  p_message_id text,
  p_in_reply_to text,
  p_references jsonb,
  p_from_email text,
  p_subject text
) returns text language plpgsql volatile as $$
declare
  v_first_ref text;
begin
  if p_references is not null and jsonb_typeof(p_references) = 'array' and jsonb_array_length(p_references) > 0 then
    v_first_ref := p_references->>0;
    if v_first_ref is not null and length(v_first_ref) > 0 then return v_first_ref; end if;
  end if;
  if p_in_reply_to is not null and length(p_in_reply_to) > 0 then return p_in_reply_to; end if;
  if p_message_id is not null and length(p_message_id) > 0 then return p_message_id; end if;
  -- Fallback: NO usable threading headers. Each such message becomes its
  -- own singleton thread. We still encode the from+subject hash for
  -- debuggability but append a uuid so no two rows collide.
  return 'fallback:' || md5(coalesce(lower(p_from_email), '') || '|' || public.normalize_subject(p_subject))
                    || ':' || replace(gen_random_uuid()::text, '-', '');
end;
$$;

-- ── C. Split existing mega-threads ───────────────────────────────────
--    For every thread_key starting with 'fallback:' that contains more
--    than 1 message, reassign each message a unique thread_key. This
--    collapses the mega-threads (some with 200+ messages) into singletons.
--    The view crm_inbox_threads will then show one row per former member.
update public.crm_inbox_messages m
   set thread_key = m.thread_key || ':' || replace(m.id::text, '-', '')
 where m.thread_key like 'fallback:%'
   and exists (
     select 1
       from public.crm_inbox_messages m2
      where m2.thread_key = m.thread_key
        and m2.id <> m.id
   );

commit;
