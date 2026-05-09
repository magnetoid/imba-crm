-- ═════════════════════════════════════════════════════════════════════════
--  20260514_provider_widen.sql
--
--  Add the v2 outbound/enrichment providers to crm_provider_credentials's
--  provider whitelist so the Settings UI's set_provider_credential RPC
--  accepts secrets for them: apify, hunter, apollo, browserbase, cal,
--  mailreach, linkedin, tavily.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_provider_credentials
  drop constraint if exists crm_provider_credentials_provider_check;

alter table public.crm_provider_credentials
  add constraint crm_provider_credentials_provider_check
  check (provider in (
    'anthropic','openai','gemini','perplexity','ollama',
    'smtp','imap','pop3',
    'apify','hunter','apollo','browserbase','cal',
    'mailreach','linkedin','tavily'
  ));

commit;
