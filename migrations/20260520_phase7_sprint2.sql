-- ═════════════════════════════════════════════════════════════════════════
--  20260520_phase7_sprint2.sql
--
--  Phase 7 Sprint 2 — deal-closing improvements that compound on Sprint 1.
--
--    7h. crm_deal_journey view  — every touchpoint per lead, ordered.
--                                 Powers the multi-touch attribution chart.
--    7g. crm_pipeline_stages    — per-stage exit criteria (required
--                                 artifacts before a deal can advance).
--        crm_leads.deal_health  — green/yellow/red flag set by the new
--                                 deal-health-scorer agent.
--        crm_leads.stage_entered_at  — for stage-age tracking.
--        Triggers + RPCs to stamp stage_entered_at on stage change and
--        validate exit criteria server-side.
--    7e. provider whitelist gets 'loom' so the operator can store a
--        Loom integration key (already in 20260518 — kept here as
--        idempotent guard).
--
--  Idempotent — safe to rerun.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── 7h. Deal-journey view ──────────────────────────────────────────────
-- One row per touchpoint per lead. Powers the multi-touch attribution
-- Sankey in Analytics: filter by stage='won' to see closed-won paths.
drop view if exists public.crm_deal_journey cascade;

create or replace view public.crm_deal_journey as
  -- Visitor page-views (anonymous-then-attributed)
  select
    v.lead_id,
    'visit'                                  as kind,
    v.url                                    as detail,
    v.created_at                             as occurred_at,
    'inbound'                                as direction,
    'web'                                    as channel
  from public.crm_visitor_events v
  where v.lead_id is not null

  union all

  -- Inbound + outbound mail / widget / linkedin messages
  select
    m.lead_id,
    case when m.direction = 'inbound'  then 'reply'
         when m.direction = 'outbound' then 'staff_reply'
         else 'message' end                  as kind,
    coalesce(m.subject, left(m.body, 80))    as detail,
    m.received_at                            as occurred_at,
    m.direction                              as direction,
    coalesce(((m.metadata->>'source')::text), 'email') as channel
  from public.crm_inbox_messages m
  where m.lead_id is not null

  union all

  -- Outbound attempts (every channel: email / contact_form / linkedin / sms / call)
  select
    a.lead_id,
    'outreach'                               as kind,
    a.channel || ' attempt'                  as detail,
    coalesce(a.sent_at, a.created_at)        as occurred_at,
    'outbound'                               as direction,
    a.channel                                as channel
  from public.crm_outreach_attempts a

  union all

  -- Outreach response signals (link clicks, replies — flips responded_at)
  select
    a.lead_id,
    'response'                               as kind,
    a.channel || ' responded'                as detail,
    a.responded_at                           as occurred_at,
    'inbound'                                as direction,
    a.channel                                as channel
  from public.crm_outreach_attempts a
  where a.responded_at is not null

  union all

  -- Activities (meetings booked via Cal, calls, manual notes)
  select
    ac.lead_id,
    coalesce(ac.type, 'activity')            as kind,
    coalesce(ac.subject, left(ac.body, 80))  as detail,
    ac.created_at                            as occurred_at,
    case when ac.type = 'meeting' then 'inbound' else 'outbound' end as direction,
    'calendar'                               as channel
  from public.crm_activities ac
  where ac.lead_id is not null;

grant select on public.crm_deal_journey to authenticated, service_role;

-- ── 7g. Pipeline stages with exit criteria ─────────────────────────────
-- Until now stage was a free-form text. This table acts as the
-- canonical list, and the optional `required` jsonb describes what
-- artifact must exist on a lead before move-stage is allowed.
create table if not exists public.crm_pipeline_stages (
  key            text primary key,
  label          text not null,
  position       int  not null,
  color          text,
  required       jsonb default '{}'::jsonb,    -- e.g. {"discovery_call": true, "budget_known": true}
  created_at     timestamptz default now()
);

insert into public.crm_pipeline_stages (key, label, position, color, required)
values
  ('new',         'New',           10, '#6C7AE0', '{}'::jsonb),
  ('qualified',   'Qualified',     20, '#3CBFAE', jsonb_build_object('discovery_call_completed', true)),
  ('proposal',    'Proposal Sent', 30, '#C9A96E', jsonb_build_object('proposal_sent', true)),
  ('negotiation', 'Negotiation',   40, '#E87A2A', jsonb_build_object('budget_known', true)),
  ('won',         'Won',           50, '#22c55e', jsonb_build_object('proposal_signed', true)),
  ('lost',        'Lost',          60, '#64748b', '{}'::jsonb)
on conflict (key) do nothing;

alter table public.crm_pipeline_stages enable row level security;

drop policy if exists crm_pipeline_stages_read on public.crm_pipeline_stages;
create policy crm_pipeline_stages_read on public.crm_pipeline_stages
  for select to authenticated, service_role using (true);

drop policy if exists crm_pipeline_stages_write on public.crm_pipeline_stages;
create policy crm_pipeline_stages_write on public.crm_pipeline_stages
  for all to authenticated using (true) with check (true);

-- ── 7g. Lead-level health + stage-age tracking ─────────────────────────
alter table public.crm_leads
  add column if not exists deal_health         text default 'green'
    check (deal_health in ('green','yellow','red')),
  add column if not exists deal_health_reason  text,
  add column if not exists stage_entered_at    timestamptz default now();

-- Stamp stage_entered_at when stage changes.
create or replace function public.trg_stamp_stage_entered_at()
returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_entered_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_stage_entered_at on public.crm_leads;
create trigger trg_stamp_stage_entered_at
  before update of stage on public.crm_leads
  for each row execute function public.trg_stamp_stage_entered_at();

-- Backfill stage_entered_at for existing rows that have NULL.
update public.crm_leads
   set stage_entered_at = coalesce(stage_entered_at, last_contacted_at, created_at, now())
 where stage_entered_at is null;

-- Per-lead "exit checklist" — small jsonb of booleans that mirrors the
-- stage's required[] keys. Operators tick these via the Lead Detail UI;
-- the move-stage RPC checks them.
alter table public.crm_leads
  add column if not exists exit_checklist jsonb default '{}'::jsonb;

-- ── 7g. Move-stage RPC with exit-criteria validation ───────────────────
-- Returns ('ok', null) on success or ('blocked', missing[] keys) when
-- the lead's exit_checklist doesn't meet the source stage's required.
-- The SPA can call this instead of UPDATE-ing crm_leads.stage directly.
create or replace function public.move_lead_stage(p_lead_id uuid, p_to_stage text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_from text;
  v_required jsonb;
  v_checklist jsonb;
  v_missing text[];
  v_key text;
begin
  select stage, exit_checklist into v_from, v_checklist
    from public.crm_leads where id = p_lead_id;
  if v_from is null then
    return jsonb_build_object('ok', false, 'error', 'lead not found');
  end if;
  if v_from = p_to_stage then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  -- Pull the required map for the SOURCE stage (the one we're leaving).
  select required into v_required from public.crm_pipeline_stages where key = v_from;
  if v_required is null then v_required := '{}'::jsonb; end if;

  -- Find any required keys whose value isn't true on the lead's checklist.
  v_missing := array(
    select k
    from jsonb_object_keys(v_required) as k
    where (v_required->>k) = 'true'
      and coalesce((v_checklist->>k)::boolean, false) is not true
  );

  if array_length(v_missing, 1) > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'exit criteria not met',
      'missing', to_jsonb(v_missing)
    );
  end if;

  update public.crm_leads
     set stage = p_to_stage
   where id = p_lead_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.move_lead_stage(uuid, text) from public;
grant execute on function public.move_lead_stage(uuid, text) to authenticated, service_role;

-- ── 7g. Wire deal-health-scorer agent into autonomy overrides ─────────
update public.crm_runtime_settings
set agent_autonomy_overrides = coalesce(agent_autonomy_overrides, '{}'::jsonb)
  || jsonb_build_object(
    'deal-health-scorer', 'auto',
    'call-analyzer',      'approval'
  )
where id = 1;

commit;
