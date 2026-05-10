-- ═════════════════════════════════════════════════════════════════════════
--  20260601_multi_inbox.sql
--
--  Phase 11.3 — Multi-inbox sender rotation.
--
--  Today the worker reads SMTP creds from a single crm_runtime_settings
--  row, so we send everything from one inbox. That caps daily volume +
--  concentrates reputation risk. With multiple inboxes the send-email
--  loop picks the one with the most headroom today and rotates.
--
--    - crm_smtp_inboxes        — one row per sending mailbox (host /
--                                 port / username / from_name / from_email
--                                 / per-day cap / status / paused
--                                 reason / last-send time + counters).
--                                 Password lives in
--                                 crm_provider_credentials with
--                                 provider='smtp:<email>'.
--    - pick_next_inbox()       — RPC: returns the active inbox with the
--                                 lowest 24h send count below its cap.
--    - mark_inbox_send(uuid)   — RPC: increments counter + bumps
--                                 last_send_at. Called by send-email.
--    - pause / unpause RPCs    — auto-throttle hooks
--
--  Back-compat: if no rows exist yet, the worker keeps using the legacy
--  crm_runtime_settings.smtp_* fields. The first time the operator adds
--  an inbox in Settings, we migrate the legacy creds across.
--
--  Whitelist 'smtp:%' provider prefix in the existing check constraint
--  so per-inbox passwords can be stored.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ── Schema ───────────────────────────────────────────────────────────
create table if not exists public.crm_smtp_inboxes (
  id              uuid primary key default uuid_generate_v4(),
  label           text not null,        -- "marketing@imba" — display only
  from_email      text not null,        -- the from-address (also doubles as creds key)
  from_name       text,
  smtp_host       text not null,
  smtp_port       int not null default 587,
  smtp_secure     boolean default false,
  smtp_username   text not null,
  daily_cap       int not null default 50,
  status          text not null default 'active'
                  check (status in ('active','paused','disabled')),
  pause_reason    text,
  last_send_at    timestamptz,
  send_count_24h  int not null default 0,      -- rolling counter; reset by RPC
  send_count_24h_ts timestamptz,                -- when the counter window started
  priority        int default 100,             -- lower wins ties (cold-only first)
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create unique index if not exists crm_smtp_inboxes_from_email_uidx
  on public.crm_smtp_inboxes (lower(from_email));
create index if not exists crm_smtp_inboxes_pick_idx
  on public.crm_smtp_inboxes (status, priority, send_count_24h);

alter table public.crm_smtp_inboxes enable row level security;

drop policy if exists crm_smtp_inboxes_read on public.crm_smtp_inboxes;
create policy crm_smtp_inboxes_read on public.crm_smtp_inboxes
  for select to authenticated, service_role using (true);

drop policy if exists crm_smtp_inboxes_write on public.crm_smtp_inboxes;
create policy crm_smtp_inboxes_write on public.crm_smtp_inboxes
  for all to authenticated using (true) with check (true);

drop policy if exists crm_smtp_inboxes_service on public.crm_smtp_inboxes;
create policy crm_smtp_inboxes_service on public.crm_smtp_inboxes
  for all to service_role using (true) with check (true);

-- ── Provider whitelist allows smtp:* prefix ──────────────────────────
alter table public.crm_provider_credentials
  drop constraint if exists crm_provider_credentials_provider_check;

alter table public.crm_provider_credentials
  add constraint crm_provider_credentials_provider_check
  check (
    provider in (
      'anthropic','openai','gemini','perplexity','ollama','openrouter',
      'smtp','imap','pop3',
      'apify','hunter','apollo','browserbase','cal',
      'mailreach','linkedin','tavily','loom','recording'
    )
    or provider like 'smtp:%'
  );

-- ── RPC: pick_next_inbox ────────────────────────────────────────────
-- Picks the active inbox with the most headroom (lowest send_count_24h
-- below cap). Resets the 24h counter if its window has aged out.
create or replace function public.pick_next_inbox()
returns table (
  id uuid, from_email text, from_name text,
  smtp_host text, smtp_port int, smtp_secure boolean, smtp_username text,
  daily_cap int, send_count_24h int
)
language plpgsql security definer set search_path = public as $$
begin
  -- Reset counters whose 24h window expired.
  update public.crm_smtp_inboxes
     set send_count_24h = 0,
         send_count_24h_ts = now()
   where status = 'active'
     and (send_count_24h_ts is null or send_count_24h_ts < now() - interval '24 hours');

  return query
    select i.id, i.from_email, i.from_name,
           i.smtp_host, i.smtp_port, i.smtp_secure, i.smtp_username,
           i.daily_cap, i.send_count_24h
      from public.crm_smtp_inboxes i
     where i.status = 'active'
       and i.send_count_24h < i.daily_cap
     order by i.priority asc, i.send_count_24h asc, i.last_send_at asc nulls first
     limit 1;
end;
$$;
grant execute on function public.pick_next_inbox() to service_role, authenticated;

-- ── RPC: mark_inbox_send ────────────────────────────────────────────
create or replace function public.mark_inbox_send(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.crm_smtp_inboxes
     set send_count_24h = send_count_24h + 1,
         send_count_24h_ts = coalesce(send_count_24h_ts, now()),
         last_send_at = now()
   where id = p_id;
end;
$$;
grant execute on function public.mark_inbox_send(uuid) to service_role;

-- ── RPC: pause_inbox / unpause_inbox ────────────────────────────────
create or replace function public.pause_inbox(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.crm_smtp_inboxes
     set status = 'paused', pause_reason = left(p_reason, 200), updated_at = now()
   where id = p_id;
end;
$$;
grant execute on function public.pause_inbox(uuid, text) to service_role, authenticated;

create or replace function public.unpause_inbox(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.crm_smtp_inboxes
     set status = 'active', pause_reason = null, updated_at = now()
   where id = p_id;
end;
$$;
grant execute on function public.unpause_inbox(uuid) to service_role, authenticated;

commit;
