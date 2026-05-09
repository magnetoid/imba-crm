-- ═════════════════════════════════════════════════════════════════════════
--  20260516_lead_scoring_and_intent.sql
--
--  Phase 7 Sprint 1: deal-closing improvements (research-backed).
--
--  Adds:
--    - Three-component scoring on crm_leads (fit/intent/engagement)
--    - crm_lead_scores  — per-event score history (decay, audit)
--    - crm_visitor_events — anonymous-then-attributed page-view stream
--                           that fuels intent_score
--    - ICP rules + hot-lead threshold + speed-to-lead settings on
--      crm_runtime_settings
--    - crm_hot_lead_alerts queue and pg_notify('crm_hot') triggers
--      that wake the worker on inbound activity
--    - crm_lead_360 view extended to expose the new columns
--
--  Idempotent — safe to rerun.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Three-component scoring on crm_leads ─────────────────────────────
-- ai_score (legacy) stays around as the AI-generated qualitative score
-- so existing UI keeps working. fit/intent/engagement are the new
-- continuously-updated components.
alter table public.crm_leads
  add column if not exists fit_score        int,
  add column if not exists intent_score     int,
  add column if not exists engagement_score int,
  add column if not exists last_scored_at   timestamptz;

create index if not exists crm_leads_intent_score_idx
  on public.crm_leads (intent_score desc nulls last);
create index if not exists crm_leads_fit_score_idx
  on public.crm_leads (fit_score desc nulls last);

-- ── 2. crm_lead_scores — history table ──────────────────────────────────
-- Every recompute writes one row so we can audit *why* a lead's score
-- moved. Reasons are a free-form list ("opened email", "visited /pricing").
create table if not exists public.crm_lead_scores (
  id               uuid primary key default uuid_generate_v4(),
  lead_id          uuid not null references public.crm_leads(id) on delete cascade,
  fit_score        int,
  intent_score     int,
  engagement_score int,
  reasons          jsonb default '[]'::jsonb,
  computed_by      text,
  computed_at      timestamptz default now()
);

create index if not exists crm_lead_scores_lead_idx
  on public.crm_lead_scores (lead_id, computed_at desc);

alter table public.crm_lead_scores enable row level security;

drop policy if exists crm_lead_scores_read on public.crm_lead_scores;
create policy crm_lead_scores_read on public.crm_lead_scores
  for select to authenticated, service_role using (true);

drop policy if exists crm_lead_scores_service on public.crm_lead_scores;
create policy crm_lead_scores_service on public.crm_lead_scores
  for all to service_role using (true) with check (true);

-- ── 3. crm_visitor_events — first-party intent stream ───────────────────
-- /track/visit on the marketing site posts here. visitor_token comes from
-- the embed widget's localStorage so anonymous visits get backfilled onto
-- the lead the moment they identify (POST /api/widget/conversations).
create table if not exists public.crm_visitor_events (
  id              uuid primary key default uuid_generate_v4(),
  visitor_token   text not null,
  lead_id         uuid references public.crm_leads(id) on delete set null,
  event_type      text not null default 'page_view'
                  check (event_type in ('page_view','click','form_view','submit','custom')),
  url             text,
  referrer        text,
  utm             jsonb default '{}'::jsonb,
  user_agent      text,
  ip              text,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz default now()
);

create index if not exists crm_visitor_events_token_idx
  on public.crm_visitor_events (visitor_token, created_at desc);
create index if not exists crm_visitor_events_lead_idx
  on public.crm_visitor_events (lead_id, created_at desc) where lead_id is not null;
create index if not exists crm_visitor_events_created_idx
  on public.crm_visitor_events (created_at desc);

alter table public.crm_visitor_events enable row level security;

drop policy if exists crm_visitor_events_read on public.crm_visitor_events;
create policy crm_visitor_events_read on public.crm_visitor_events
  for select to authenticated, service_role using (true);

drop policy if exists crm_visitor_events_service on public.crm_visitor_events;
create policy crm_visitor_events_service on public.crm_visitor_events
  for all to service_role using (true) with check (true);

-- Backfill anonymous visits onto a lead when a widget conversation
-- claims the same visitor_token. Called from widget-api after identify.
create or replace function public.attribute_visitor_events(p_token text, p_lead_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.crm_visitor_events
     set lead_id = p_lead_id
   where visitor_token = p_token
     and lead_id is null;
  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;
grant execute on function public.attribute_visitor_events(text, uuid) to service_role;

-- ── 4. Settings: ICP rules + hot-lead threshold + speed-to-lead ─────────
alter table public.crm_runtime_settings
  add column if not exists icp_rules            jsonb   default '{}'::jsonb,
  add column if not exists hot_lead_min_fit     int     default 70,
  add column if not exists hot_lead_min_intent  int     default 50,
  add column if not exists speed_to_lead_enabled boolean default true,
  add column if not exists speed_to_lead_channels jsonb default '["push"]'::jsonb;

-- Seed a sensible default ICP shape so the lead-scorer has something to
-- compare against on first run. Operator overrides in Settings.
update public.crm_runtime_settings
set icp_rules = jsonb_build_object(
  'industries',       jsonb_build_array(),
  'employee_min',     0,
  'employee_max',     5000,
  'countries',        jsonb_build_array(),
  'titles_must_match', jsonb_build_array('founder','ceo','cmo','marketing','head','director','vp'),
  'tech_must_match',   jsonb_build_array(),
  'tech_block',        jsonb_build_array()
)
where id = 1
  and (icp_rules is null or icp_rules = '{}'::jsonb);

-- Also wire the new lead-scorer agent into autonomy overrides as 'auto'
-- (it's an internal compute step — no human approval needed).
update public.crm_runtime_settings
set agent_autonomy_overrides = coalesce(agent_autonomy_overrides, '{}'::jsonb)
  || jsonb_build_object('lead-scorer', 'auto')
where id = 1
  and not (coalesce(agent_autonomy_overrides, '{}'::jsonb) ? 'lead-scorer');

-- ── 5. crm_hot_lead_alerts — queue for browser-push delivery ────────────
-- The worker writes one row per hot signal; the SPA reads + clears unread
-- rows when the operator focuses the tab (or browser-push fires).
create table if not exists public.crm_hot_lead_alerts (
  id           uuid primary key default uuid_generate_v4(),
  lead_id      uuid not null references public.crm_leads(id) on delete cascade,
  reason       text not null,        -- short human label, e.g. "Replied to outreach"
  source_table text not null,        -- 'crm_inbox_messages' | 'crm_widget_conversations' | …
  source_id    uuid,
  fit_score    int,
  intent_score int,
  read_at      timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz default now()
);

create index if not exists crm_hot_lead_alerts_unread_idx
  on public.crm_hot_lead_alerts (created_at desc) where read_at is null;

alter table public.crm_hot_lead_alerts enable row level security;

drop policy if exists crm_hot_lead_alerts_read on public.crm_hot_lead_alerts;
create policy crm_hot_lead_alerts_read on public.crm_hot_lead_alerts
  for select to authenticated, service_role using (true);

drop policy if exists crm_hot_lead_alerts_write on public.crm_hot_lead_alerts;
create policy crm_hot_lead_alerts_write on public.crm_hot_lead_alerts
  for update to authenticated using (true) with check (true);  -- so SPA can mark read

drop policy if exists crm_hot_lead_alerts_service on public.crm_hot_lead_alerts;
create policy crm_hot_lead_alerts_service on public.crm_hot_lead_alerts
  for all to service_role using (true) with check (true);

-- Nudge: pg_notify('crm_hot', json) any time a new alert lands so the
-- worker forwards it to operator devices without polling delay.
create or replace function public.notify_crm_hot()
returns trigger language plpgsql as $$
begin
  perform pg_notify('crm_hot', json_build_object(
    'alert_id', new.id,
    'lead_id',  new.lead_id,
    'reason',   new.reason
  )::text);
  return new;
end;
$$;

drop trigger if exists notify_crm_hot_trg on public.crm_hot_lead_alerts;
create trigger notify_crm_hot_trg
  after insert on public.crm_hot_lead_alerts
  for each row execute function public.notify_crm_hot();

-- Inbound activity (crm_inbox_messages.direction='inbound') and widget
-- conversations both wake an inspection trigger. The trigger only enqueues
-- a hot-lead alert if the lead is above the configured fit/intent
-- threshold; otherwise it stays silent so we don't drown the operator.
create or replace function public.maybe_enqueue_hot_alert(
  p_lead_id uuid, p_reason text, p_source_table text, p_source_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_min_fit int;
  v_min_intent int;
  v_enabled boolean;
  v_fit int;
  v_intent int;
begin
  if p_lead_id is null then return; end if;

  select coalesce(speed_to_lead_enabled, true),
         coalesce(hot_lead_min_fit, 70),
         coalesce(hot_lead_min_intent, 50)
    into v_enabled, v_min_fit, v_min_intent
    from public.crm_runtime_settings
   where id = 1;

  if not v_enabled then return; end if;

  select fit_score, intent_score
    into v_fit, v_intent
    from public.crm_leads
   where id = p_lead_id;

  -- A hot lead = either component above its threshold. We deliberately
  -- 'or' rather than 'and' because a brand-new lead has no fit_score yet
  -- but a clear intent signal (e.g. "submitted contact form") should
  -- still wake somebody.
  if (v_fit is not null and v_fit >= v_min_fit)
     or (v_intent is not null and v_intent >= v_min_intent)
     or (v_fit is null and v_intent is null) then
    insert into public.crm_hot_lead_alerts (lead_id, reason, source_table, source_id, fit_score, intent_score)
    values (p_lead_id, left(p_reason, 200), p_source_table, p_source_id, v_fit, v_intent);
  end if;
end;
$$;

-- Trigger on inbound inbox messages.
create or replace function public.trg_inbox_hot_alert()
returns trigger language plpgsql as $$
begin
  if new.direction = 'inbound' and new.lead_id is not null then
    perform public.maybe_enqueue_hot_alert(
      new.lead_id,
      coalesce('Reply: ' || left(coalesce(new.subject, new.body, ''), 80), 'Inbound message'),
      'crm_inbox_messages',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inbox_hot_alert on public.crm_inbox_messages;
create trigger trg_inbox_hot_alert
  after insert on public.crm_inbox_messages
  for each row execute function public.trg_inbox_hot_alert();

-- Trigger on widget conversations: wake on first identification (since
-- the inbound message trigger above will also fire, this is the "we have
-- a name + email now" signal that's worth its own alert).
create or replace function public.trg_widget_hot_alert()
returns trigger language plpgsql as $$
begin
  if new.lead_id is not null and (old.lead_id is null or new.lead_id <> old.lead_id) then
    perform public.maybe_enqueue_hot_alert(
      new.lead_id,
      'New chat conversation',
      'crm_widget_conversations',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_widget_hot_alert on public.crm_widget_conversations;
create trigger trg_widget_hot_alert
  after update of lead_id on public.crm_widget_conversations
  for each row execute function public.trg_widget_hot_alert();

-- Trigger on outreach attempt response (replies, link clicks, calendar
-- bookings flip responded_at).
create or replace function public.trg_attempt_hot_alert()
returns trigger language plpgsql as $$
begin
  if new.responded_at is not null and (old.responded_at is null or old.responded_at <> new.responded_at) then
    perform public.maybe_enqueue_hot_alert(
      new.lead_id,
      'Lead responded via ' || new.channel,
      'crm_outreach_attempts',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_attempt_hot_alert on public.crm_outreach_attempts;
create trigger trg_attempt_hot_alert
  after update of responded_at on public.crm_outreach_attempts
  for each row execute function public.trg_attempt_hot_alert();

-- Visitor-events trigger: enqueue a `lead-scorer` agent job whenever an
-- anonymous event gets attributed to a lead, so intent_score recomputes.
create or replace function public.trg_visitor_event_score()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.lead_id is not null and old.lead_id is null then
    insert into public.crm_agent_jobs (agent_kind, lead_id, input, triggered_by)
    values ('lead-scorer', new.lead_id,
            jsonb_build_object('reason', 'visitor_event_attributed', 'event_id', new.id),
            'trigger:visitor_events');
  elsif tg_op = 'INSERT' and new.lead_id is not null then
    insert into public.crm_agent_jobs (agent_kind, lead_id, input, triggered_by)
    values ('lead-scorer', new.lead_id,
            jsonb_build_object('reason', 'visitor_event_inserted', 'event_id', new.id),
            'trigger:visitor_events');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_visitor_event_score on public.crm_visitor_events;
create trigger trg_visitor_event_score
  after insert or update of lead_id on public.crm_visitor_events
  for each row execute function public.trg_visitor_event_score();

-- ── 6. Extend crm_lead_360 view with the new score columns ──────────────
-- Drop + recreate so the column list updates cleanly.
drop view if exists public.crm_lead_360 cascade;

create or replace view public.crm_lead_360 as
select
  l.id,
  l.name,
  l.email,
  l.company,
  l.stage,
  l.ai_score,
  l.ai_notes,
  l.fit_score,
  l.intent_score,
  l.engagement_score,
  l.last_scored_at,
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
    select count(*) from public.crm_visitor_events v
    where v.lead_id = l.id
      and v.created_at > now() - interval '30 days'
  ) as visits_30d,
  (
    select count(*) from public.crm_proposals p
    where p.lead_id = l.id and p.status = 'signed'
  ) as signed_proposals
from public.crm_leads l
left join public.crm_companies c on c.id = l.company_id;

grant select on public.crm_lead_360 to authenticated, service_role;

commit;
