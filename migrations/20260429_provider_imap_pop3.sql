-- ═════════════════════════════════════════════════════════════════════════
--  20260429_provider_imap_pop3.sql
--
--  Allow 'imap' and 'pop3' as provider values in
--  crm_provider_credentials so the inbox-puller can store inbound-mail
--  passwords there. Keeps the existing CHECK semantics (whitelist of
--  known providers) — just widens it.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_provider_credentials
  drop constraint if exists crm_provider_credentials_provider_check;

alter table public.crm_provider_credentials
  add constraint crm_provider_credentials_provider_check
  check (provider in ('anthropic','openai','gemini','perplexity','ollama','smtp','imap','pop3'));

commit;
