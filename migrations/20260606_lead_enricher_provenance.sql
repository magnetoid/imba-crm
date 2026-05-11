-- ═════════════════════════════════════════════════════════════════════════
--  20260606_lead_enricher_provenance.sql
--
--  Waterfall enrichment + provenance tracking. Today lead-enricher tries
--  Hunter then Apollo as two unconditional steps and overwrites fields
--  without tracking which provider supplied what. This migration adds a
--  jsonb column to record per-field provenance:
--    crm_leads.provenance = {
--      "email":    "hunter",
--      "title":    "apollo",
--      "linkedin": "apify",
--      "phone":    "apollo"
--    }
--
--  When we add a third provider (findymail / anymailfinder / etc), the
--  agent will read this column to know "this lead's email was supplied
--  by hunter with score 94 — don't override unless the new provider
--  beats that score".
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_leads
  add column if not exists provenance jsonb default '{}'::jsonb;

commit;
