-- ═════════════════════════════════════════════════════════════════════════
--  20260518_openrouter_provider.sql
--
--  Wire OpenRouter as a first-class AI provider.
--
--  OpenRouter is an OpenAI-compatible gateway giving access to 300+ models
--  (Claude, GPT, Gemini, DeepSeek, Llama, …) behind a single API key.
--  Adding it as a provider option lets the operator flip between models
--  in Settings without code changes.
--
--  - Whitelist 'openrouter' in crm_provider_credentials
--  - Add openrouter_model + openrouter_models columns on crm_runtime_settings
--  - Allow 'openrouter' in active_ai_provider check
--  - Disable 'site_url'/'app_name' optional headers by storing them in
--    extra jsonb on the credentials row (the model-router reads them).
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Whitelist openrouter in the provider credentials table ───────────
alter table public.crm_provider_credentials
  drop constraint if exists crm_provider_credentials_provider_check;

alter table public.crm_provider_credentials
  add constraint crm_provider_credentials_provider_check
  check (provider in (
    'anthropic','openai','gemini','perplexity','ollama','openrouter',
    'smtp','imap','pop3',
    'apify','hunter','apollo','browserbase','cal',
    'mailreach','linkedin','tavily','loom'
  ));

-- ── 2. Settings columns ────────────────────────────────────────────────
alter table public.crm_runtime_settings
  add column if not exists openrouter_model  text default 'anthropic/claude-sonnet-4',
  add column if not exists openrouter_models jsonb default '[]'::jsonb;

-- ── 3. Allow 'openrouter' in active_ai_provider ────────────────────────
do $$
declare
  conname text;
begin
  select cc.conname into conname
  from pg_constraint cc
  join pg_class cl on cl.oid = cc.conrelid
  where cl.relname = 'crm_runtime_settings'
    and pg_get_constraintdef(cc.oid) ilike '%active_ai_provider%';
  if conname is not null then
    execute format('alter table public.crm_runtime_settings drop constraint %I', conname);
  end if;
end $$;

alter table public.crm_runtime_settings
  add constraint crm_runtime_settings_active_ai_provider_check
  check (active_ai_provider in (
    'anthropic','openai','gemini','perplexity','ollama','openrouter'
  ));

commit;
