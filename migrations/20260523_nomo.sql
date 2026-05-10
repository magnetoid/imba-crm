-- ═════════════════════════════════════════════════════════════════════════
--  20260523_nomo.sql
--
--  Phase 8 — Nomo, the agentic CRM copilot.
--
--  - crm_nomo_threads      — one thread per topic the operator chats about
--  - crm_nomo_messages     — every user/assistant/tool turn
--  - crm_runtime_settings  — adds nomo_enabled, nomo_mode, nomo_autopilot_tools
--                             nomo_system_prompt
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.crm_nomo_threads (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users(id) on delete set null,
  title           text,                      -- AI-generated after the first 2 turns
  pinned_lead_id  uuid references public.crm_leads(id) on delete set null,
  archived        boolean not null default false,
  last_message_at timestamptz default now(),
  created_at      timestamptz default now()
);

create index if not exists crm_nomo_threads_user_idx
  on public.crm_nomo_threads (user_id, last_message_at desc);
create index if not exists crm_nomo_threads_archived_idx
  on public.crm_nomo_threads (archived);

alter table public.crm_nomo_threads enable row level security;

drop policy if exists crm_nomo_threads_owner_read on public.crm_nomo_threads;
create policy crm_nomo_threads_owner_read on public.crm_nomo_threads
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists crm_nomo_threads_owner_write on public.crm_nomo_threads;
create policy crm_nomo_threads_owner_write on public.crm_nomo_threads
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists crm_nomo_threads_service on public.crm_nomo_threads;
create policy crm_nomo_threads_service on public.crm_nomo_threads
  for all to service_role using (true) with check (true);

-- ── Messages ─────────────────────────────────────────────────────────
create table if not exists public.crm_nomo_messages (
  id            uuid primary key default uuid_generate_v4(),
  thread_id     uuid not null references public.crm_nomo_threads(id) on delete cascade,
  role          text not null check (role in ('system','user','assistant','tool')),
  content       text,                          -- visible text
  tool_calls    jsonb default '[]'::jsonb,     -- assistant: list of {id, name, input}
  tool_results  jsonb default '[]'::jsonb,     -- tool: list of {tool_call_id, result, error?}
  status        text not null default 'done'
                check (status in ('streaming','awaiting_approval','approved','rejected','done','failed')),
  approved_by   uuid references auth.users(id),
  approved_at   timestamptz,
  rejected_at   timestamptz,
  model         text,
  tokens_in     int,
  tokens_out    int,
  cost_cents    int,
  error         text,
  created_at    timestamptz default now()
);

create index if not exists crm_nomo_messages_thread_idx
  on public.crm_nomo_messages (thread_id, created_at);
create index if not exists crm_nomo_messages_pending_idx
  on public.crm_nomo_messages (status) where status = 'awaiting_approval';

alter table public.crm_nomo_messages enable row level security;

drop policy if exists crm_nomo_messages_owner_read on public.crm_nomo_messages;
create policy crm_nomo_messages_owner_read on public.crm_nomo_messages
  for select to authenticated using (
    exists (
      select 1 from public.crm_nomo_threads t
      where t.id = thread_id and (t.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists crm_nomo_messages_owner_write on public.crm_nomo_messages;
create policy crm_nomo_messages_owner_write on public.crm_nomo_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.crm_nomo_threads t
      where t.id = thread_id and (t.user_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.crm_nomo_threads t
      where t.id = thread_id and (t.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists crm_nomo_messages_service on public.crm_nomo_messages;
create policy crm_nomo_messages_service on public.crm_nomo_messages
  for all to service_role using (true) with check (true);

-- Bump thread.last_message_at on every message insert.
create or replace function public.trg_bump_thread_last_message_at()
returns trigger language plpgsql as $$
begin
  update public.crm_nomo_threads
     set last_message_at = new.created_at
   where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_thread on public.crm_nomo_messages;
create trigger trg_bump_thread
  after insert on public.crm_nomo_messages
  for each row execute function public.trg_bump_thread_last_message_at();

-- ── Settings additions ────────────────────────────────────────────────
alter table public.crm_runtime_settings
  add column if not exists nomo_enabled boolean default true,
  add column if not exists nomo_mode text default 'approval'
    check (nomo_mode in ('chat-only','approval','autopilot')),
  add column if not exists nomo_autopilot_tools jsonb default
    '["search_leads","get_lead","query_pipeline","get_metrics","summarize_period","find_recent_signals","lead-scorer","deal-health-scorer"]'::jsonb,
  add column if not exists nomo_system_prompt text default '';

commit;
