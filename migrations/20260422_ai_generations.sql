-- ═════════════════════════════════════════════════════════════════════════
--  20260422_ai_generations.sql
--  Per-call audit trail for every AI generation the CRM produces.
--
--  Why this table exists:
--    - The product is "AI-assisted with manual approval". Approval is
--      meaningless without knowing what was approved, who approved it,
--      which model + prompt produced it, and what the human changed before
--      sending. This table is that record.
--    - Fire-and-forget AI calls (scoring, enrichment, analytics) also log
--      here so cost and volume can be measured per feature per org.
--
--  Relationship to existing tables:
--    - crm_outreach_emails.ai_generation_id → the draft this email was
--      approved from. approved_at / sent_at live on the email; the
--      generation row has the original AI output for diffing.
--    - crm_proposals.ai_generation_id → same idea for proposal drafts.
--
--  Fields populated today vs later:
--    - feature, task_type, input_text, output_text, created_by, created_at:
--      always filled from the frontend helper.
--    - model, tokens_in, tokens_out, cost_cents: filled when the backend
--      (Supabase ai-proxy Edge Function or model-router server) returns
--      metadata. Nullable so legacy calls don't break.
--    - prompt_key, prompt_version: filled once the prompt registry lands.
-- ═════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),

  -- Which product surface triggered it. Not an enum; features get added a
  -- lot and adding a check constraint would require a migration every time.
  feature text not null,                    -- e.g. 'outreach_email', 'lead_score', 'inbox_analyze'
  task_type text not null,                  -- matches model-router TaskType
  lead_id uuid references public.crm_leads(id) on delete set null,

  -- What went in / came out.
  input_text text not null,
  input_meta jsonb default '{}'::jsonb,     -- lead fields, runtime settings snapshot, etc
  output_text text,                         -- null if the call failed
  error_text text,                          -- populated iff the call failed

  -- Provider/model metadata, filled when available.
  provider text,
  model text,
  tokens_in integer,
  tokens_out integer,
  cost_cents numeric(12, 4),

  -- Prompt registry linkage (populated when the registry lands).
  prompt_key text,
  prompt_version integer,

  -- Approval workflow. status starts at 'draft'; approval-gated flows move
  -- through 'approved' before they're acted on. Fire-and-forget flows can
  -- stay at 'logged' forever.
  status text not null default 'logged'
    check (status in ('logged', 'draft', 'edited', 'approved', 'rejected', 'sent')),
  final_content text,                       -- what the human actually sent, if different from output_text
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  rejected_by uuid references auth.users(id),
  rejected_at timestamptz,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_generations_feature_created_at_idx
  on public.ai_generations (feature, created_at desc);
create index if not exists ai_generations_lead_id_created_at_idx
  on public.ai_generations (lead_id, created_at desc)
  where lead_id is not null;
create index if not exists ai_generations_status_idx
  on public.ai_generations (status)
  where status in ('draft', 'approved');

-- ── updated_at trigger ──────────────────────────────────────────────────
create or replace function public.touch_ai_generations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists touch_ai_generations on public.ai_generations;
create trigger touch_ai_generations
  before update on public.ai_generations
  for each row execute function public.touch_ai_generations_updated_at();

-- ── FKs from existing tables ────────────────────────────────────────────
-- ai_generation_id on emails/proposals lets the final artifact point back
-- to the AI draft it came from. Nullable for manually-composed items.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'crm_outreach_emails') then
    alter table public.crm_outreach_emails
      add column if not exists ai_generation_id uuid
        references public.ai_generations(id) on delete set null;
    create index if not exists crm_outreach_emails_ai_gen_idx
      on public.crm_outreach_emails (ai_generation_id)
      where ai_generation_id is not null;
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'crm_proposals') then
    alter table public.crm_proposals
      add column if not exists ai_generation_id uuid
        references public.ai_generations(id) on delete set null;
    create index if not exists crm_proposals_ai_gen_idx
      on public.crm_proposals (ai_generation_id)
      where ai_generation_id is not null;
  end if;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table public.ai_generations enable row level security;

-- Any authenticated user can read/write their own generations. Tighten this
-- when multi-tenancy (org_id) lands.
drop policy if exists "ai_generations_read_own" on public.ai_generations;
create policy "ai_generations_read_own" on public.ai_generations
  for select to authenticated
  using (created_by = auth.uid() or approved_by = auth.uid());

drop policy if exists "ai_generations_insert_own" on public.ai_generations;
create policy "ai_generations_insert_own" on public.ai_generations
  for insert to authenticated
  with check (created_by = auth.uid() or created_by is null);

drop policy if exists "ai_generations_update_own" on public.ai_generations;
create policy "ai_generations_update_own" on public.ai_generations
  for update to authenticated
  using (created_by = auth.uid() or approved_by = auth.uid())
  with check (true);

-- Admins can read everything.
drop policy if exists "ai_generations_admin_read" on public.ai_generations;
create policy "ai_generations_admin_read" on public.ai_generations
  for select to authenticated
  using (coalesce(public.is_admin(), false));

commit;
