-- ═════════════════════════════════════════════════════════════════════════
--  20260528_sender_health.sql
--
--  Phase 10.5 — deliverability instrumentation.
--    - crm_outreach_emails: bounce_reason, complained_at, last_error
--    - crm_runtime_settings: smtp_inbox_health jsonb cache from MailReach
--    - crm_sender_health view: per-sender 30d stats
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_outreach_emails
  add column if not exists bounce_reason text,
  add column if not exists complained_at timestamptz,
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz;

alter table public.crm_runtime_settings
  add column if not exists smtp_inbox_health jsonb default '{}'::jsonb,
  add column if not exists smtp_inbox_health_at timestamptz,
  add column if not exists smtp_auto_throttle boolean default true,
  add column if not exists smtp_max_bounce_rate_pct  int default 5,
  add column if not exists smtp_max_complaint_rate_pct numeric(4,2) default 0.10;

drop view if exists public.crm_sender_health cascade;
create or replace view public.crm_sender_health as
select
  coalesce(split_part(s.smtp_from_email, '@', 2), 'unknown') as sender_domain,
  count(e.*) filter (where e.created_at > now() - interval '30 days')              as total_30d,
  count(e.*) filter (where e.status in ('sent','opened','replied') and e.created_at > now() - interval '30 days') as sent_30d,
  count(e.*) filter (where e.status in ('opened','replied')         and e.created_at > now() - interval '30 days') as opened_30d,
  count(e.*) filter (where e.status = 'replied'                       and e.created_at > now() - interval '30 days') as replied_30d,
  count(e.*) filter (where e.bounce_reason is not null                and e.created_at > now() - interval '30 days') as bounced_30d,
  count(e.*) filter (where e.complained_at is not null                and e.created_at > now() - interval '30 days') as complained_30d
from public.crm_runtime_settings s
left join public.crm_outreach_emails e on true
where s.id = 1
group by sender_domain;

grant select on public.crm_sender_health to authenticated, service_role;

commit;
