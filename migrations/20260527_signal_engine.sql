-- ═════════════════════════════════════════════════════════════════════════
--  20260527_signal_engine.sql
--
--  Phase 10.3 — Signal Engine. Real-world events that should trigger
--  outbound: funding rounds, hiring posts, news mentions, tech-stack
--  changes. The watcher loops insert here; the route_signal() trigger
--  fans them out to the right downstream agent or sequence.
--
--  - crm_signals          — captured events
--  - crm_signal_routes    — operator-editable rules: when (kind+filter)
--                            then (action). Enqueues agent jobs / starts
--                            sequences / creates hot-lead alerts.
--  - route_signal()       — trigger fires on insert into crm_signals,
--                            walks active routes, fires matching actions
--  - settings: signals_enabled toggle + per-watcher day cadence
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── Signals table ────────────────────────────────────────────────────
create table if not exists public.crm_signals (
  id           uuid primary key default uuid_generate_v4(),
  lead_id      uuid references public.crm_leads(id) on delete set null,
  company_id   uuid references public.crm_companies(id) on delete set null,
  kind         text not null
               check (kind in (
                 'funding_announced','hiring_post','news_mention',
                 'tech_added','tech_removed','social_post','custom'
               )),
  source       text not null,                 -- 'crunchbase' | 'apify-linkedin-jobs' | 'tavily' | 'builtwith' | …
  headline     text,                          -- 1-line for the operator UI
  url          text,
  payload      jsonb default '{}'::jsonb,     -- raw provider response
  dedup_key    text not null,                 -- composite identity to avoid double-insert
  captured_at  timestamptz default now()
);

-- Each watcher must compute a stable dedup_key (e.g. company.id + round.id
-- for Crunchbase, company.id + jobs.id for LinkedIn) so reruns don't dupe.
create unique index if not exists crm_signals_dedup
  on public.crm_signals (kind, dedup_key);

create index if not exists crm_signals_lead_idx     on public.crm_signals (lead_id, captured_at desc);
create index if not exists crm_signals_company_idx  on public.crm_signals (company_id, captured_at desc);
create index if not exists crm_signals_kind_idx     on public.crm_signals (kind, captured_at desc);
create index if not exists crm_signals_recent_idx   on public.crm_signals (captured_at desc);

alter table public.crm_signals enable row level security;
drop policy if exists crm_signals_read on public.crm_signals;
create policy crm_signals_read on public.crm_signals
  for select to authenticated, service_role using (true);
drop policy if exists crm_signals_service on public.crm_signals;
create policy crm_signals_service on public.crm_signals
  for all to service_role using (true) with check (true);

-- ── Signal routes ────────────────────────────────────────────────────
-- Operator-editable rules. when_filter is a jsonb match spec:
--   { fit_min?: 0-100, intent_min?: 0-100, stage_in?: text[], tag_any?: text[] }
-- then_action is a jsonb action spec, one of:
--   { type: 'enqueue_agent', kind: 'outreach-drafter', input?: {...} }
--   { type: 'start_sequence', sequence_id: '<uuid>' }
--   { type: 'hot_alert', reason: 'string template — uses {{kind}} {{headline}}' }
--   { type: 'add_tag', tag: 'fresh-funding' }
create table if not exists public.crm_signal_routes (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  when_kind    text not null,
  when_filter  jsonb default '{}'::jsonb,
  then_action  jsonb not null,
  is_active    boolean default true,
  position     int not null default 100,    -- lower = evaluated first
  fired_count  int default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists crm_signal_routes_kind_idx
  on public.crm_signal_routes (when_kind) where is_active;

alter table public.crm_signal_routes enable row level security;
drop policy if exists crm_signal_routes_read on public.crm_signal_routes;
create policy crm_signal_routes_read on public.crm_signal_routes
  for select to authenticated, service_role using (true);
drop policy if exists crm_signal_routes_write on public.crm_signal_routes;
create policy crm_signal_routes_write on public.crm_signal_routes
  for all to authenticated using (true) with check (true);
drop policy if exists crm_signal_routes_service on public.crm_signal_routes;
create policy crm_signal_routes_service on public.crm_signal_routes
  for all to service_role using (true) with check (true);

-- ── Settings columns ────────────────────────────────────────────────
alter table public.crm_runtime_settings
  add column if not exists signals_enabled boolean default true,
  add column if not exists signal_poll_companies_per_run int default 25,
  add column if not exists signal_crunchbase_actor   text default 'apify/crunchbase-companies-scraper',
  add column if not exists signal_linkedin_jobs_actor text default 'apify/linkedin-jobs-scraper',
  add column if not exists signal_builtwith_enabled  boolean default false;

-- ── route_signal trigger ────────────────────────────────────────────
-- Fires after every insert into crm_signals. Walks all active routes
-- whose when_kind matches and whose when_filter is satisfied by the
-- target lead, then performs the route's then_action.
create or replace function public.route_signal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_route   record;
  v_lead    record;
  v_filter  jsonb;
  v_action  jsonb;
  v_proceed boolean;
  v_reason  text;
begin
  if new.lead_id is null then return new; end if;

  select id, fit_score, intent_score, stage, tags
    into v_lead
    from public.crm_leads
   where id = new.lead_id;
  if not found then return new; end if;

  for v_route in
    select id, name, when_filter, then_action
      from public.crm_signal_routes
     where is_active = true and when_kind = new.kind
     order by position, created_at
  loop
    v_filter := coalesce(v_route.when_filter, '{}'::jsonb);
    v_proceed := true;

    if v_filter ? 'fit_min' then
      if coalesce(v_lead.fit_score, 0) < (v_filter->>'fit_min')::int then v_proceed := false; end if;
    end if;
    if v_proceed and v_filter ? 'intent_min' then
      if coalesce(v_lead.intent_score, 0) < (v_filter->>'intent_min')::int then v_proceed := false; end if;
    end if;
    if v_proceed and v_filter ? 'stage_in' then
      if not (v_lead.stage = any(array(select jsonb_array_elements_text(v_filter->'stage_in')))) then
        v_proceed := false;
      end if;
    end if;
    if v_proceed and v_filter ? 'tag_any' then
      if not (v_lead.tags && array(select jsonb_array_elements_text(v_filter->'tag_any'))) then
        v_proceed := false;
      end if;
    end if;
    if not v_proceed then continue; end if;

    v_action := v_route.then_action;
    v_reason := coalesce(v_action->>'reason', v_route.name) || ' — ' || coalesce(new.headline, new.kind);

    if v_action->>'type' = 'enqueue_agent' then
      insert into public.crm_agent_jobs (agent_kind, lead_id, input, triggered_by)
      values (
        v_action->>'kind',
        new.lead_id,
        coalesce(v_action->'input', '{}'::jsonb)
          || jsonb_build_object('signal_id', new.id, 'signal_kind', new.kind),
        'signal-route:' || v_route.id::text
      );
    elsif v_action->>'type' = 'start_sequence' then
      -- Cancel any active first to satisfy the unique-active-per-lead index.
      update public.crm_lead_sequences
         set status = 'cancelled',
             cancelled_at = now(),
             cancelled_reason = 'replaced_by_signal_route'
       where lead_id = new.lead_id and status = 'active';
      insert into public.crm_lead_sequences (lead_id, sequence_id, next_due_at)
      values (new.lead_id, (v_action->>'sequence_id')::uuid, now())
      on conflict do nothing;
    elsif v_action->>'type' = 'hot_alert' then
      insert into public.crm_hot_lead_alerts (lead_id, reason, source_table, source_id)
      values (new.lead_id, left(v_reason, 200), 'crm_signals', new.id);
    elsif v_action->>'type' = 'add_tag' then
      update public.crm_leads
         set tags = array_append(coalesce(tags, '{}'::text[]), v_action->>'tag')
       where id = new.lead_id
         and not (coalesce(tags, '{}'::text[]) && array[v_action->>'tag']);
    end if;

    update public.crm_signal_routes set fired_count = fired_count + 1 where id = v_route.id;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_route_signal on public.crm_signals;
create trigger trg_route_signal
  after insert on public.crm_signals
  for each row execute function public.route_signal();

-- ── Default routes seeded ───────────────────────────────────────────
-- These are the "out-of-the-box" rules a new operator gets. They can
-- edit / disable from Signals → Routes.
insert into public.crm_signal_routes (id, name, when_kind, when_filter, then_action, position, is_active)
values
  ('22222222-aaaa-4aaa-aaaa-000000000001'::uuid,
   'Funding raise → fast follow-up',
   'funding_announced',
   '{"fit_min": 60}'::jsonb,
   '{"type": "start_sequence", "sequence_id": "11111111-aaaa-4aaa-aaaa-000000000001"}'::jsonb,
   10, true),
  ('22222222-aaaa-4aaa-aaaa-000000000002'::uuid,
   'Funding raise → hot alert',
   'funding_announced',
   '{}'::jsonb,
   '{"type": "hot_alert", "reason": "Funding raised — strike while it''s fresh"}'::jsonb,
   20, true),
  ('22222222-aaaa-4aaa-aaaa-000000000003'::uuid,
   'GTM hire → cold sequence',
   'hiring_post',
   '{"fit_min": 70}'::jsonb,
   '{"type": "start_sequence", "sequence_id": "11111111-aaaa-4aaa-aaaa-000000000002"}'::jsonb,
   30, true),
  ('22222222-aaaa-4aaa-aaaa-000000000004'::uuid,
   'News mention → tag for review',
   'news_mention',
   '{}'::jsonb,
   '{"type": "add_tag", "tag": "in-the-news"}'::jsonb,
   40, true),
  ('22222222-aaaa-4aaa-aaaa-000000000005'::uuid,
   'Tech change → research + draft',
   'tech_added',
   '{"fit_min": 60}'::jsonb,
   '{"type": "enqueue_agent", "kind": "outreach-drafter", "input": {"channel": "email"}}'::jsonb,
   50, true)
on conflict (id) do nothing;

commit;
