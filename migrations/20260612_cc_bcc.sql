-- ═════════════════════════════════════════════════════════════════════════
--  20260612_cc_bcc.sql
--
--  CC + BCC support on both directions of the mail surface.
--
--  Inbound  (crm_inbox_messages): cc + bcc text[]. Populated by imap.ts
--    from parsed.cc.value / parsed.bcc.value (mailparser).
--
--  Outbound (crm_outreach_emails): cc + bcc text[]. Populated by the SPA
--    composer + Reply-All path. send-email.ts hands them to nodemailer's
--    `cc` and `bcc` fields. BCC is set on the SMTP envelope only —
--    nodemailer strips the header from the visible message per spec.
--
--  Both are text[] to preserve any number of recipients. The 30 KB
--  Postgres array size limit is plenty for realistic CC lists; mailing
--  lists go in the To field anyway.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_inbox_messages
  add column if not exists cc  text[],
  add column if not exists bcc text[];

alter table public.crm_outreach_emails
  add column if not exists cc  text[],
  add column if not exists bcc text[];

commit;
