-- ═════════════════════════════════════════════════════════════════════════
--  20260604_outbound_message_id.sql
--
--  Reply-threading fix. Until now we sent outbound email via nodemailer
--  with no Message-ID header — nodemailer picked a random one at the SMTP
--  layer, and we never captured it. When a prospect replied, their
--  In-Reply-To pointed at a Message-ID we never stored, so the inbound
--  IMAP poller computed a new fallback thread_key instead of attaching
--  the reply to the original outbound's thread. Every prospect response
--  showed up as a fresh standalone thread.
--
--  The fix lives in code: send-email.ts now generates a deterministic
--  Message-ID per outreach (<outreach:<uuid>@imbaproduction.com>) and
--  sets the SMTP Message-ID + In-Reply-To + References headers. This
--  migration adds the columns the code persists into.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_outreach_emails
  add column if not exists sent_message_id text,
  add column if not exists in_reply_to     text,
  add column if not exists email_references jsonb;

create index if not exists crm_outreach_emails_sent_message_id_idx
  on public.crm_outreach_emails (sent_message_id)
  where sent_message_id is not null;

commit;
