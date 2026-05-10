-- ═════════════════════════════════════════════════════════════════════════
--  20260525_sequence_router.sql
--
--  Phase 10.1 — Sequence Router. The 3 templates seeded in 20260521 were
--  orphans — no dispatcher consumed them. This migration wires:
--
--    - crm_lead_sequences           — per-lead sequence assignment with
--                                     state (active / paused / completed
--                                     / cancelled) + cursor (current_step,
--                                     next_due_at)
--    - auto-start trigger           — when lead-scorer raises a lead's
--                                     fit_score and intent_score above the
--                                     configured thresholds AND no active
--                                     sequence exists, start the default
--                                     template
--    - settings field               — default_outbound_sequence_id picks
--                                     which template auto-starts
--
--  The dispatcher loop lives in the worker (added in this sprint) and
--  reads `crm_lead_sequences WHERE status='active' AND next_due_at <= now()`
--  to materialise crm_outreach_attempts rows, advancing current_step.
--
--  Reply-threading (Phase 7d) already cancels remaining steps when an
--  inbound message lands → we just flip status='cancelled' on the row.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── Table ─────────────────────────────────────────────────────────────
create table if not exists public.crm_lead_sequences (
  id              uuid primary key default uuid_generate_v4(),
  lead_id         uuid not null references public.crm_leads(id) on delete cascade,
  sequence_id    uuid not null references public.crm_outreach_sequences(id) on delete restrict,
  status          text not null default 'active'
                  check (status in ('active','paused','completed','cancelled')),
  current_step    int  not null default 0,    -- 0-indexed pointer into sequence.steps[]
  next_due_at     timestamptz not null default now(),
  started_at      timestamptz default now(),
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  cancelled_reason text,
  created_at      timestamptz default now()
);

-- One active sequence per lead (paused/completed/cancelled don't count
-- so an operator can re-assign after a hiatus).
create unique index if not exists crm_lead_sequences_one_active
  on public.crm_lead_sequences (lead_id) where status = 'active';

create index if not exists crm_lead_sequences_due_idx
  on public.crm_lead_sequences (next_due_at) where status = 'active';
create index if not exists crm_lead_sequences_status_idx
  on public.crm_lead_sequences (status);

alter table public.crm_lead_sequences enable row level security;

drop policy if exists crm_lead_sequences_read on public.crm_lead_sequences;
create policy crm_lead_sequences_read on public.crm_lead_sequences
  for select to authenticated, service_role using (true);

drop policy if exists crm_lead_sequences_write on public.crm_lead_sequences;
create policy crm_lead_sequences_write on public.crm_lead_sequences
  for all to authenticated using (true) with check (true);

drop policy if exists crm_lead_sequences_service on public.crm_lead_sequences;
create policy crm_lead_sequences_service on public.crm_lead_sequences
  for all to service_role using (true) with check (true);

-- ── Settings ─────────────────────────────────────────────────────────
alter table public.crm_runtime_settings
  add column if not exists default_outbound_sequence_id uuid,
  add column if not exists sequence_autostart_enabled  boolean default true,
  add column if not exists sequence_autostart_min_fit  int default 70,
  add column if not exists sequence_autostart_min_intent int default 50;

-- Default to the seeded "Cold outbound — 7 touch" template if it exists.
update public.crm_runtime_settings
   set default_outbound_sequence_id = '11111111-aaaa-4aaa-aaaa-000000000002'::uuid
 where id = 1
   and default_outbound_sequence_id is null;

-- ── Auto-start trigger on lead-scorer updates ────────────────────────
-- When a lead's fit/intent crosses the threshold AND no active sequence
-- exists AND sequence_autostart_enabled is true, kick off the default
-- template. Cheap because we only check on score-column updates.
create or replace function public.trg_autostart_sequence()
returns trigger language plpgsql as $$
declare
  v_settings record;
  v_active_count int;
begin
  -- Cheap early-out if nothing relevant changed.
  if (new.fit_score is null or new.intent_score is null) then return new; end if;
  if (new.fit_score   = coalesce(old.fit_score,   -1)
  and new.intent_score = coalesce(old.intent_score, -1)) then return new; end if;
  if new.stage in ('won','lost') then return new; end if;

  select default_outbound_sequence_id, sequence_autostart_enabled,
         sequence_autostart_min_fit, sequence_autostart_min_intent
    into v_settings
    from public.crm_runtime_settings
   where id = 1;
  if not coalesce(v_settings.sequence_autostart_enabled, true) then return new; end if;
  if v_settings.default_outbound_sequence_id is null then return new; end if;

  if new.fit_score    < coalesce(v_settings.sequence_autostart_min_fit, 70)    then return new; end if;
  if new.intent_score < coalesce(v_settings.sequence_autostart_min_intent, 50) then return new; end if;

  select count(*) into v_active_count
    from public.crm_lead_sequences
   where lead_id = new.id and status = 'active';
  if v_active_count > 0 then return new; end if;

  insert into public.crm_lead_sequences (lead_id, sequence_id, next_due_at)
  values (new.id, v_settings.default_outbound_sequence_id, now())
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_autostart_sequence on public.crm_leads;
create trigger trg_autostart_sequence
  after update of fit_score, intent_score on public.crm_leads
  for each row execute function public.trg_autostart_sequence();

-- ── Reply-threading hookup ────────────────────────────────────────────
-- The Phase 7d reply-threading already cancels queued
-- crm_outreach_attempts when an inbound reply lands. Extend it to also
-- flip the sequence to status='cancelled' so the dispatcher stops
-- materialising new steps.
create or replace function public.trg_cancel_sequence_on_reply()
returns trigger language plpgsql as $$
begin
  -- The trigger fires when an outreach attempt's responded_at flips
  -- non-null. The Phase 7d threading already updates this on inbound.
  if new.responded_at is not null and old.responded_at is null and new.sequence_id is not null then
    update public.crm_lead_sequences
       set status = 'cancelled',
           cancelled_at = new.responded_at,
           cancelled_reason = 'lead_replied'
     where lead_id = new.lead_id
       and sequence_id = new.sequence_id
       and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cancel_sequence_on_reply on public.crm_outreach_attempts;
create trigger trg_cancel_sequence_on_reply
  after update of responded_at on public.crm_outreach_attempts
  for each row execute function public.trg_cancel_sequence_on_reply();

commit;
