-- ═════════════════════════════════════════════════════════════════════════
--  20260525_fix_missing_rls_policies.sql
--
--  Critical RLS hotfix. Twelve crm_* tables have RLS enabled but ZERO
--  policies attached, which is why the SPA's Inbox / Outreach /
--  Proposals / Invoices / Activities pages have been silently empty —
--  PostgREST returns 200 with `[]` because no policy permits the read.
--
--  Affected tables (RLS=on, policy_count=0):
--    - crm_activities
--    - crm_ai_settings
--    - crm_analytics_snapshots
--    - crm_email_events
--    - crm_follow_up_suggestions
--    - crm_inbox_audit_logs
--    - crm_inbox_messages
--    - crm_invoices
--    - crm_outreach_campaigns
--    - crm_outreach_emails
--    - crm_proposals
--    - crm_prospect_searches
--
--  Standard policy set applied to each:
--    1. <table>_read     — authenticated + service_role can SELECT
--    2. <table>_write    — authenticated can INSERT/UPDATE/DELETE
--    3. <table>_service  — service_role can do anything (worker)
--
--  This matches the policy shape already in place on crm_leads,
--  crm_companies, crm_outreach_attempts, crm_agent_jobs etc.
--
--  Idempotent — drops policies before recreating.
-- ═════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  t text;
  tbls text[] := array[
    'crm_activities',
    'crm_ai_settings',
    'crm_analytics_snapshots',
    'crm_email_events',
    'crm_follow_up_suggestions',
    'crm_inbox_audit_logs',
    'crm_inbox_messages',
    'crm_invoices',
    'crm_outreach_campaigns',
    'crm_outreach_emails',
    'crm_proposals',
    'crm_prospect_searches'
  ];
begin
  foreach t in array tbls loop
    -- Drop any pre-existing matching policies (idempotency).
    execute format('drop policy if exists %I_read    on public.%I', t, t);
    execute format('drop policy if exists %I_write   on public.%I', t, t);
    execute format('drop policy if exists %I_service on public.%I', t, t);

    -- Read for authenticated + service_role.
    execute format(
      'create policy %I_read on public.%I for select to authenticated, service_role using (true)',
      t, t
    );
    -- Write for authenticated (INSERT/UPDATE/DELETE).
    execute format(
      'create policy %I_write on public.%I for all to authenticated using (true) with check (true)',
      t, t
    );
    -- Service role gets everything (the worker).
    execute format(
      'create policy %I_service on public.%I for all to service_role using (true) with check (true)',
      t, t
    );
  end loop;
end $$;

-- Sanity check: every CRM table should now have ≥1 policy.
do $$
declare
  bad_count int;
begin
  select count(*) into bad_count
    from pg_class c
    where c.relkind = 'r'
      and c.relnamespace = 'public'::regnamespace
      and c.relname like 'crm_%'
      and c.relrowsecurity
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
  if bad_count > 0 then
    raise warning 'Still % crm_* tables with RLS-on and zero policies', bad_count;
  end if;
end $$;

commit;
