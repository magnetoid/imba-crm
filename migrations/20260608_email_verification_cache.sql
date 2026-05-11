-- ═════════════════════════════════════════════════════════════════════════
--  20260608_email_verification_cache.sql
--
--  Pre-send email verification. The single biggest churn cause for
--  AI-SDR tools (per 2026 research) is hallucinated contact data
--  landing in spam traps. Apify/Apollo claim 90%+ deliverability,
--  reality is 72-91% — leaving 9-28% of outbound burning sender
--  reputation.
--
--  Fix: before send-email.ts hands an outreach to nodemailer, run a
--  Hunter email-verifier check. Cache the result on the lead so we
--  don't re-verify the same address every time a sequence ticks.
--
--  Shape:
--    crm_leads.email_verification = {
--      "result":   "deliverable" | "risky" | "undeliverable" | "unknown",
--      "score":    97,
--      "checked_at": "2026-05-11T10:30:00Z",
--      "provider": "hunter"
--    }
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

alter table public.crm_leads
  add column if not exists email_verification jsonb;

create index if not exists crm_leads_email_verification_result_idx
  on public.crm_leads ((email_verification->>'result'))
  where email_verification is not null;

commit;
