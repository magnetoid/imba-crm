-- ═════════════════════════════════════════════════════════════════════════
--  20260424_prompt_registry.sql
--  Creates the crm_prompts table for managing AI prompts.
-- ═════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.crm_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null,
  version integer not null,
  description text,
  system_prompt text,
  user_prompt text not null,
  provider text,
  model text,
  is_active boolean default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  
  -- Ensure each version of a prompt key is unique
  constraint crm_prompts_key_version_key unique (prompt_key, version)
);

-- Partial index to ensure only one active version per prompt_key
create unique index if not exists crm_prompts_active_idx on public.crm_prompts (prompt_key) where is_active = true;

-- ── updated_at trigger ──────────────────────────────────────────────────
create or replace function public.touch_crm_prompts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists touch_crm_prompts on public.crm_prompts;
create trigger touch_crm_prompts
  before update on public.crm_prompts
  for each row execute function public.touch_crm_prompts_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table public.crm_prompts enable row level security;

-- Authenticated users can read active prompts
drop policy if exists "crm_prompts_read_active" on public.crm_prompts;
create policy "crm_prompts_read_active" on public.crm_prompts
  for select to authenticated
  using (is_active = true);

-- Admins can read all versions and manage prompts
drop policy if exists "crm_prompts_admin_all" on public.crm_prompts;
create policy "crm_prompts_admin_all" on public.crm_prompts
  for all to authenticated
  using (coalesce(public.is_admin(), false))
  with check (coalesce(public.is_admin(), false));

-- ── Seed Data ───────────────────────────────────────────────────────────
-- Seed the SEO Content Brief prompt to demonstrate usage
insert into public.crm_prompts (prompt_key, version, description, user_prompt, is_active) values
(
  'seo_content_brief',
  1,
  'Generates an SEO content brief for a specific topic and target page.',
  'You are a senior SEO content strategist. Create a detailed content brief{{pageCtx}} about: "{{topic}}"
Company context: {{COMPANY_CONTEXT}}

Return ONLY a valid JSON object with this structure:
{
  "h1": "Main headline",
  "meta_title": "SEO title under 60 chars",
  "meta_description": "Meta description 120-160 chars with CTA",
  "target_keywords": ["primary keyword", "secondary keyword", ...5 keywords],
  "outline": [
    {"level":"h2","text":"Section heading"},
    {"level":"h3","text":"Subsection"}
  ],
  "word_count": 1200,
  "cta": "Call to action text",
  "internal_links": ["/work", "/contact"]
}',
  true
)
on conflict (prompt_key, version) do nothing;

commit;
