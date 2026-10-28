-- ═════════════════════════════════════════════════════════════════════════
--  20261028_signal_linkedin_jobs_actor.sql
--
--  The LinkedIn hiring watcher's default actor from 20260527_signal_engine.sql,
--  apify/linkedin-jobs-scraper, returns 404 on the Apify API, so the daily
--  watcher fails on every install with an Apify key.
--
--  Fix:
--    A. New default for crm_runtime_settings.signal_linkedin_jobs_actor:
--       johnvc/linkedin-jobs-api (watchers.ts now sends its input shape).
--    B. Move rows still on the dead default to it. A different actor set
--       by hand is left alone.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_runtime_settings
  alter column signal_linkedin_jobs_actor set default 'johnvc/linkedin-jobs-api';

update public.crm_runtime_settings
   set signal_linkedin_jobs_actor = 'johnvc/linkedin-jobs-api'
 where signal_linkedin_jobs_actor = 'apify/linkedin-jobs-scraper';

commit;
