-- ═════════════════════════════════════════════════════════════════════════
--  20260610_inbox_attachments_bucket.sql
--
--  Inbox attachments (Phase 12.6).
--
--  Inbound side: imap.ts has been detecting has_attachments on every
--  message but discarding the bytes. This migration creates a Storage
--  bucket the worker uploads into, keyed by <message_id>/<filename>.
--  The SPA reads metadata.attachments[] off crm_inbox_messages and
--  generates signed URLs to download.
--
--  Outbound side: the composer can attach files. The SPA uploads to the
--  same bucket and persists the storage paths on
--  crm_outreach_emails.attachment_storage_paths. send-email.ts reads
--  those, downloads from Storage, and hands them to nodemailer as
--  attachments.
--
--  RLS: authenticated users (operators) can read all; service_role
--  has full access. Public read is OFF (signed URLs only).
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── Bucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inbox-attachments', 'inbox-attachments', false, 26214400, null)  -- 25 MB cap
on conflict (id) do nothing;

-- ── Outbound column ──────────────────────────────────────────────────
alter table public.crm_outreach_emails
  add column if not exists attachment_storage_paths text[];

-- ── RLS policies on storage.objects for this bucket ──────────────────
-- Drop any prior policies on this bucket so the migration is rerunnable.
drop policy if exists inbox_attachments_authenticated_read on storage.objects;
create policy inbox_attachments_authenticated_read
  on storage.objects for select
  to authenticated
  using (bucket_id = 'inbox-attachments');

drop policy if exists inbox_attachments_authenticated_insert on storage.objects;
create policy inbox_attachments_authenticated_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'inbox-attachments');

drop policy if exists inbox_attachments_service_all on storage.objects;
create policy inbox_attachments_service_all
  on storage.objects for all
  to service_role
  using (bucket_id = 'inbox-attachments')
  with check (bucket_id = 'inbox-attachments');

commit;
