-- ═════════════════════════════════════════════════════════════════════════
--  20260524_widen_provider_whitelist_recording.sql
--
--  Add 'recording' to the crm_provider_credentials provider whitelist
--  so the new Settings → Integrations tab can store the webhook secret
--  consumed by /api/webhooks/recording (loadProviderCredential('recording')
--  in packages/inbox-puller/src/webhooks/recording.ts).
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_provider_credentials
  drop constraint if exists crm_provider_credentials_provider_check;

alter table public.crm_provider_credentials
  add constraint crm_provider_credentials_provider_check
  check (provider in (
    'anthropic','openai','gemini','perplexity','ollama','openrouter',
    'smtp','imap','pop3',
    'apify','hunter','apollo','browserbase','cal',
    'mailreach','linkedin','tavily','loom',
    'recording'
  ));

commit;
