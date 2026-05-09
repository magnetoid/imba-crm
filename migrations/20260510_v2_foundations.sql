-- ═════════════════════════════════════════════════════════════════════════
--  20260510_v2_foundations.sql
--
--  Foundations for the v2 restructure (see /Users/magnetoid/.claude/plans/
--  typed-jumping-quasar.md). Adds:
--
--    - crm_companies              — accounts, separate from contacts
--    - crm_outreach_attempts      — channel-agnostic outbound touch table
--                                   (email, contact_form, linkedin_dm, sms)
--    - crm_agent_jobs             — top-level agent runs with status/state
--    - crm_agent_runs             — per-step record (tool calls + cost)
--    - crm_widget_conversations   — sessions for the embeddable chat widget
--    - crm_outreach_sequences     — multi-step outbound playbooks
--    - crm_lead_360 (view)        — single-row-per-lead join used by Pipeline
--
--  Plus new columns on crm_runtime_settings to drive the three operating
--  modes (manual / approval / auto) and store per-agent overrides.
--
--  Idempotent — safe to rerun.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── crm_companies ───────────────────────────────────────────────────────
create table if not exists public.crm_companies (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  domain        text unique,
  linkedin_url  text,
  industry      text,
  size          text,
  country       text,
  tech_stack    jsonb default '{}'::jsonb,
  enrichment    jsonb default '{}'::jsonb,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists crm_companies_domain_idx on public.crm_companies (lower(domain));
create index if not exists crm_companies_name_idx   on public.crm_companies (lower(name));

alter table public.crm_companies enable row level security;

drop policy if exists crm_companies_read on public.crm_companies;
create policy crm_companies_read on public.crm_companies
  for select to authenticated, service_role using (true);

drop policy if exists crm_companies_write on public.crm_companies;
create policy crm_companies_write on public.crm_companies
  for all to authenticated using (true) with check (true);

drop policy if exists crm_companies_service on public.crm_companies;
create policy crm_companies_service on public.crm_companies
  for all to service_role using (true) with check (true);

-- Attach a company to each lead (nullable; back-compat).
alter table public.crm_leads
  add column if not exists company_id uuid references public.crm_companies(id) on delete set null;

create index if not exists crm_leads_company_id_idx on public.crm_leads (company_id);

-- ── crm_outreach_attempts ───────────────────────────────────────────────
-- Replaces "all outbound touches are emails" — a channel-agnostic record
-- of every attempt to reach a lead. crm_outreach_emails stays around for
-- email-specific fields (tracking pixel, opened_at, etc.) and is linked
-- here via metadata.outreach_email_id.
create table if not exists public.crm_outreach_attempts (
  id              uuid primary key default uuid_generate_v4(),
  lead_id         uuid not null references public.crm_leads(id) on delete cascade,
  sequence_id     uuid,
  step_no         int,
  channel         text not null check (channel in ('email','contact_form','linkedin_dm','linkedin_connect','sms','call','manual')),
  status          text not null default 'queued' check (status in ('queued','running','sent','delivered','failed','skipped','cancelled')),
  provider        text,
  agent_run_id    uuid,
  metadata        jsonb default '{}'::jsonb,
  scheduled_for   timestamptz,
  sent_at         timestamptz,
  responded_at    timestamptz,
  error           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists crm_outreach_attempts_lead_idx     on public.crm_outreach_attempts (lead_id);
create index if not exists crm_outreach_attempts_status_idx   on public.crm_outreach_attempts (status);
create index if not exists crm_outreach_attempts_channel_idx  on public.crm_outreach_attempts (channel);
create index if not exists crm_outreach_attempts_sequence_idx on public.crm_outreach_attempts (sequence_id, step_no);

alter table public.crm_outreach_attempts enable row level security;

drop policy if exists crm_outreach_attempts_read on public.crm_outreach_attempts;
create policy crm_outreach_attempts_read on public.crm_outreach_attempts
  for select to authenticated, service_role using (true);

drop policy if exists crm_outreach_attempts_write on public.crm_outreach_attempts;
create policy crm_outreach_attempts_write on public.crm_outreach_attempts
  for all to authenticated using (true) with check (true);

drop policy if exists crm_outreach_attempts_service on public.crm_outreach_attempts;
create policy crm_outreach_attempts_service on public.crm_outreach_attempts
  for all to service_role using (true) with check (true);

-- ── crm_outreach_sequences ──────────────────────────────────────────────
-- Multi-step playbook templates ("4-step CEO sequence", "warm-intro flow").
-- Each step is a JSON describing channel + delay + condition. When applied
-- to a lead, the worker creates crm_outreach_attempts rows on schedule.
create table if not exists public.crm_outreach_sequences (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text,
  steps       jsonb not null default '[]'::jsonb,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.crm_outreach_sequences enable row level security;

drop policy if exists crm_outreach_sequences_read on public.crm_outreach_sequences;
create policy crm_outreach_sequences_read on public.crm_outreach_sequences
  for select to authenticated, service_role using (true);

drop policy if exists crm_outreach_sequences_write on public.crm_outreach_sequences;
create policy crm_outreach_sequences_write on public.crm_outreach_sequences
  for all to authenticated using (true) with check (true);

drop policy if exists crm_outreach_sequences_service on public.crm_outreach_sequences;
create policy crm_outreach_sequences_service on public.crm_outreach_sequences
  for all to service_role using (true) with check (true);

-- ── crm_agent_jobs + crm_agent_runs ────────────────────────────────────
-- Top-level agent invocation + per-step trace. Status flow:
--   queued → running → awaiting_approval → approved → running → finished
--                                   ↓
--                                paused / cancelled / failed
create table if not exists public.crm_agent_jobs (
  id              uuid primary key default uuid_generate_v4(),
  agent_kind      text not null,
  status          text not null default 'queued'
                  check (status in ('queued','running','awaiting_approval','approved','paused','finished','cancelled','failed')),
  autonomy        text not null default 'approval'
                  check (autonomy in ('manual','approval','auto')),
  input           jsonb default '{}'::jsonb,
  output          jsonb,
  lead_id         uuid references public.crm_leads(id)     on delete set null,
  company_id      uuid references public.crm_companies(id) on delete set null,
  triggered_by    text,
  created_at      timestamptz default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  error           text
);

create index if not exists crm_agent_jobs_status_idx       on public.crm_agent_jobs (status);
create index if not exists crm_agent_jobs_agent_kind_idx   on public.crm_agent_jobs (agent_kind);
create index if not exists crm_agent_jobs_lead_id_idx      on public.crm_agent_jobs (lead_id);
create index if not exists crm_agent_jobs_created_at_idx   on public.crm_agent_jobs (created_at desc);

create table if not exists public.crm_agent_runs (
  id            uuid primary key default uuid_generate_v4(),
  job_id        uuid not null references public.crm_agent_jobs(id) on delete cascade,
  step_no       int not null,
  step_name     text not null,
  tool_name     text,
  status        text not null default 'running'
                check (status in ('running','awaiting_approval','approved','rejected','manual_required','done','failed','skipped')),
  input         jsonb default '{}'::jsonb,
  output        jsonb,
  edited_output jsonb,
  approved_at   timestamptz,
  approved_by   uuid references auth.users(id),
  rejected_at   timestamptz,
  model         text,
  tokens_in     int,
  tokens_out    int,
  cost_cents    int,
  error         text,
  started_at    timestamptz default now(),
  finished_at   timestamptz
);

create index if not exists crm_agent_runs_job_idx        on public.crm_agent_runs (job_id, step_no);
create index if not exists crm_agent_runs_status_idx     on public.crm_agent_runs (status);

alter table public.crm_agent_jobs enable row level security;
alter table public.crm_agent_runs enable row level security;

drop policy if exists crm_agent_jobs_read on public.crm_agent_jobs;
create policy crm_agent_jobs_read on public.crm_agent_jobs
  for select to authenticated, service_role using (true);
drop policy if exists crm_agent_jobs_write on public.crm_agent_jobs;
create policy crm_agent_jobs_write on public.crm_agent_jobs
  for all to authenticated using (true) with check (true);
drop policy if exists crm_agent_jobs_service on public.crm_agent_jobs;
create policy crm_agent_jobs_service on public.crm_agent_jobs
  for all to service_role using (true) with check (true);

drop policy if exists crm_agent_runs_read on public.crm_agent_runs;
create policy crm_agent_runs_read on public.crm_agent_runs
  for select to authenticated, service_role using (true);
drop policy if exists crm_agent_runs_write on public.crm_agent_runs;
create policy crm_agent_runs_write on public.crm_agent_runs
  for all to authenticated using (true) with check (true);
drop policy if exists crm_agent_runs_service on public.crm_agent_runs;
create policy crm_agent_runs_service on public.crm_agent_runs
  for all to service_role using (true) with check (true);

-- Wake the worker when a job is queued or approved.
create or replace function public.notify_crm_jobs()
returns trigger language plpgsql as $$
begin
  if new.status in ('queued','approved') then
    perform pg_notify('crm_jobs', json_build_object(
      'job_id', new.id,
      'agent_kind', new.agent_kind,
      'status', new.status
    )::text);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_crm_jobs_trg on public.crm_agent_jobs;
create trigger notify_crm_jobs_trg
  after insert or update of status on public.crm_agent_jobs
  for each row execute function public.notify_crm_jobs();

-- ── crm_widget_conversations ────────────────────────────────────────────
-- One row per visitor session that opens the embedded chat. Each message
-- they send + each staff reply is a row in crm_inbox_messages with
-- metadata.conversation_id pointing back here.
create table if not exists public.crm_widget_conversations (
  id              uuid primary key default uuid_generate_v4(),
  lead_id         uuid references public.crm_leads(id) on delete set null,
  visitor_token   text unique not null,    -- generated client-side, stored in localStorage
  visitor_name    text,
  visitor_email   text,
  visitor_company text,
  origin          text,                    -- the host page URL where the widget was shown
  user_agent      text,
  ip              text,
  status          text not null default 'open'
                  check (status in ('open','closed','spam')),
  last_message_at timestamptz default now(),
  created_at      timestamptz default now()
);

create index if not exists crm_widget_conversations_token_idx on public.crm_widget_conversations (visitor_token);
create index if not exists crm_widget_conversations_lead_idx  on public.crm_widget_conversations (lead_id);
create index if not exists crm_widget_conversations_status_idx on public.crm_widget_conversations (status);

alter table public.crm_widget_conversations enable row level security;
drop policy if exists crm_widget_conversations_read on public.crm_widget_conversations;
create policy crm_widget_conversations_read on public.crm_widget_conversations
  for select to authenticated, service_role using (true);
drop policy if exists crm_widget_conversations_write on public.crm_widget_conversations;
create policy crm_widget_conversations_write on public.crm_widget_conversations
  for all to authenticated using (true) with check (true);
drop policy if exists crm_widget_conversations_service on public.crm_widget_conversations;
create policy crm_widget_conversations_service on public.crm_widget_conversations
  for all to service_role using (true) with check (true);

-- ── Operating-mode columns on runtime settings ──────────────────────────
alter table public.crm_runtime_settings
  add column if not exists agent_autonomy_default text default 'approval'
    check (agent_autonomy_default in ('manual','approval','auto')),
  add column if not exists agent_autonomy_overrides jsonb default '{}'::jsonb,
  add column if not exists lead_pipelines jsonb default '[]'::jsonb,
  add column if not exists linkedin_daily_connect_limit int default 25,
  add column if not exists linkedin_daily_dm_limit      int default 50,
  add column if not exists cal_api_token text,
  add column if not exists cal_event_type_id text,
  add column if not exists widget_enabled  boolean default false,
  add column if not exists widget_origins  jsonb default '[]'::jsonb,
  add column if not exists widget_branding jsonb default '{}'::jsonb;

-- Seed sensible defaults for which agents start in which mode. The UI lets
-- the operator change these. Inbox auto-categorize is low-risk so it's
-- 'auto' by default; everything outbound defaults to 'approval'.
update public.crm_runtime_settings
set agent_autonomy_overrides = jsonb_build_object(
  'inbox-categorize', 'auto',
  'lead-enricher',    'auto',
  'lead-finder',      'approval',
  'outreach-drafter', 'approval',
  'inbox-replier',    'approval',
  'meeting-booker',   'approval',
  'proposal-writer',  'approval',
  'contact-form-fill','approval',
  'linkedin-dm',      'manual'
)
where id = 1
  and (agent_autonomy_overrides is null or agent_autonomy_overrides = '{}'::jsonb);

-- ── crm_lead_360 view ───────────────────────────────────────────────────
-- Single-row-per-lead used by the Pipeline module. Replaces 4 separate
-- table fetches in the SPA with one indexed select.
create or replace view public.crm_lead_360 as
select
  l.id,
  l.name,
  l.email,
  l.company,
  l.stage,
  l.ai_score,
  l.ai_notes,
  l.value,
  l.probability,
  l.created_at,
  l.last_contacted_at,
  l.company_id,
  c.domain               as company_domain,
  c.linkedin_url         as company_linkedin_url,
  c.tech_stack           as company_tech_stack,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'channel', a.channel, 'status', a.status,
      'sent_at', a.sent_at, 'responded_at', a.responded_at
    ) order by a.created_at desc), '[]'::jsonb)
    from public.crm_outreach_attempts a
    where a.lead_id = l.id
    limit 20
  ) as recent_attempts,
  (
    select count(*) from public.crm_outreach_emails e
    where e.lead_id = l.id and e.opened_at is not null
  ) as total_opens,
  (
    select count(*) from public.crm_outreach_emails e
    where e.lead_id = l.id and e.replied_at is not null
  ) as total_replies,
  (
    select max(e.sent_at) from public.crm_outreach_emails e
    where e.lead_id = l.id
  ) as last_email_sent_at,
  (
    select count(*) from public.crm_proposals p
    where p.lead_id = l.id and p.status = 'signed'
  ) as signed_proposals
from public.crm_leads l
left join public.crm_companies c on c.id = l.company_id;

grant select on public.crm_lead_360 to authenticated, service_role;

commit;
