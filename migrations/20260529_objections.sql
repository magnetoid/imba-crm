-- ═════════════════════════════════════════════════════════════════════════
--  20260529_objections.sql
--
--  Phase 10.6 — Objection tracker. The call-analyzer (Phase 7f) already
--  extracts objections from a single recording. This sprint adds:
--    - crm_leads.objections jsonb           — running list per lead
--    - crm_objection_tags                   — operator-curated taxonomy
--                                              (e.g. pricing_too_high,
--                                              missing_feature, wrong_time)
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_leads
  add column if not exists objections jsonb default '[]'::jsonb;

create table if not exists public.crm_objection_tags (
  id          uuid primary key default uuid_generate_v4(),
  slug        text unique not null,            -- e.g. "pricing_too_high"
  label       text not null,                   -- e.g. "Pricing too high"
  description text,
  counter_hint text,                            -- 1-line counter the drafter can quote
  created_at  timestamptz default now()
);

alter table public.crm_objection_tags enable row level security;
drop policy if exists crm_objection_tags_read on public.crm_objection_tags;
create policy crm_objection_tags_read on public.crm_objection_tags
  for select to authenticated, service_role using (true);
drop policy if exists crm_objection_tags_write on public.crm_objection_tags;
create policy crm_objection_tags_write on public.crm_objection_tags
  for all to authenticated using (true) with check (true);
drop policy if exists crm_objection_tags_service on public.crm_objection_tags;
create policy crm_objection_tags_service on public.crm_objection_tags
  for all to service_role using (true) with check (true);

-- Seed a small starter taxonomy.
insert into public.crm_objection_tags (slug, label, description, counter_hint) values
  ('pricing_too_high',     'Pricing too high',
   'Prospect feels the price is above budget or above expected.',
   'Anchor on outcome value, offer a phased pilot or smaller starter package.'),
  ('wrong_time',           'Bad timing',
   'Prospect says now is not the right time (busy quarter, mid-launch, …).',
   'Set a concrete reminder for the named event ("circle back after your Series B closes").'),
  ('missing_feature',      'Missing feature',
   'Prospect needs a capability we do not (yet) offer.',
   'Acknowledge the gap, log the request, propose what we DO solve well.'),
  ('competitor_locked_in', 'Competitor lock-in',
   'Prospect is using a competitor and feels switching cost is too high.',
   'Identify pain with current vendor; offer migration/parallel pilot.'),
  ('not_decision_maker',   'Not the decision maker',
   'Contact lacks authority. We need to widen the pod.',
   'Ask for warm intro to the budget owner; offer a multi-stakeholder demo.'),
  ('no_clear_use_case',    'No clear use case',
   'Prospect cannot articulate why they would buy.',
   'Discovery: pull a specific pain point + quantify it.')
on conflict (slug) do nothing;

commit;
