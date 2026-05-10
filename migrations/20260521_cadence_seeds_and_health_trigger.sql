-- ═════════════════════════════════════════════════════════════════════════
--  20260521_cadence_seeds_and_health_trigger.sql
--
--  - Seeds three pre-built outreach sequences operators can pick out of
--    the box (Phase 7d).
--  - Adds a postgres trigger that enqueues a deal-health-scorer job
--    whenever a lead's stage changes, so the colored stripe on the
--    pipeline card updates within a tick (instead of waiting for the
--    daily sweep).
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── Cadence templates ──────────────────────────────────────────────────
-- Each `steps` element has the shape the dispatcher already understands:
--   { day_offset, channel, condition?, body_hint? }
-- The CRM's sequence builder will read these and let operators clone +
-- tweak instead of starting from a blank canvas.

insert into public.crm_outreach_sequences (id, name, description, steps, is_active)
values
  ('11111111-aaaa-4aaa-aaaa-000000000001'::uuid,
   'Inbound — fast follow-up',
   '3 touches over 2 days for fresh inbound leads who fill the form or chat with the widget.',
   jsonb_build_array(
     jsonb_build_object('day_offset', 0, 'channel', 'email',
       'body_hint', 'Thank them, restate their goal in one line, propose 2 specific call slots.'),
     jsonb_build_object('day_offset', 1, 'channel', 'email',
       'condition', 'no_open',
       'body_hint', 'Same offer, different subject line. Add one concrete proof point.'),
     jsonb_build_object('day_offset', 2, 'channel', 'linkedin_connect',
       'condition', 'no_reply',
       'body_hint', 'Personal LinkedIn note referencing the form fill. No pitch.')
   ),
   true)
on conflict (id) do update set
  name        = excluded.name,
  description = excluded.description,
  steps       = excluded.steps,
  updated_at  = now();

insert into public.crm_outreach_sequences (id, name, description, steps, is_active)
values
  ('11111111-aaaa-4aaa-aaaa-000000000002'::uuid,
   'Cold outbound — 7 touch',
   'Industry-standard cold cadence: 4 emails + contact form + LinkedIn + breakup over 18 days.',
   jsonb_build_array(
     jsonb_build_object('day_offset',  0, 'channel', 'email',
       'body_hint', 'Short opener, specific reason you reached out, one CTA.'),
     jsonb_build_object('day_offset',  3, 'channel', 'email',
       'condition', 'no_open',
       'body_hint', 'Re-send with new subject. Lead with a 1-line case study.'),
     jsonb_build_object('day_offset',  6, 'channel', 'contact_form',
       'condition', 'no_reply',
       'body_hint', 'Fill the contact form — same message, bypass spam filters.'),
     jsonb_build_object('day_offset',  9, 'channel', 'email',
       'condition', 'no_reply',
       'body_hint', 'Pattern interrupt — 2 sentences. Ask if priorities have shifted.'),
     jsonb_build_object('day_offset', 12, 'channel', 'linkedin_connect',
       'condition', 'no_reply',
       'body_hint', 'LinkedIn connection request, no pitch in the note.'),
     jsonb_build_object('day_offset', 15, 'channel', 'email',
       'condition', 'no_reply',
       'body_hint', 'Direct ask: "Wrong person?" or "Not a priority?" — give an out.'),
     jsonb_build_object('day_offset', 18, 'channel', 'email',
       'condition', 'no_reply',
       'body_hint', 'Breakup email. 3 lines. Door open if anything changes.')
   ),
   true)
on conflict (id) do update set
  name        = excluded.name,
  description = excluded.description,
  steps       = excluded.steps,
  updated_at  = now();

insert into public.crm_outreach_sequences (id, name, description, steps, is_active)
values
  ('11111111-aaaa-4aaa-aaaa-000000000003'::uuid,
   'Re-engagement — dormant',
   'Light 2-touch sequence for leads who went silent 60+ days ago.',
   jsonb_build_array(
     jsonb_build_object('day_offset', 0, 'channel', 'email',
       'body_hint', 'Genuine "checking in" — reference what they were considering. New release / case study.'),
     jsonb_build_object('day_offset', 7, 'channel', 'linkedin_connect',
       'condition', 'no_reply',
       'body_hint', 'Soft LinkedIn touch. Share something useful (not pitching).')
   ),
   true)
on conflict (id) do update set
  name        = excluded.name,
  description = excluded.description,
  steps       = excluded.steps,
  updated_at  = now();

-- ── Per-lead deal-health trigger ───────────────────────────────────────
-- Stamping happens via trg_stamp_stage_entered_at (BEFORE update).
-- Now also enqueue a deal-health-scorer agent job AFTER the update so
-- the colored stripe on the pipeline card refreshes within seconds.
create or replace function public.trg_enqueue_deal_health_after_stage()
returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.crm_agent_jobs (agent_kind, lead_id, input, triggered_by)
    values ('deal-health-scorer', new.id,
            jsonb_build_object('reason', 'stage_changed', 'from', old.stage, 'to', new.stage),
            'trigger:stage_change');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_deal_health_after_stage on public.crm_leads;
create trigger trg_enqueue_deal_health_after_stage
  after update of stage on public.crm_leads
  for each row execute function public.trg_enqueue_deal_health_after_stage();

commit;
