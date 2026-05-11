# Spec template

Copy this into `docs/specs/YYYYMMDD-<slug>.md` for any change that spans **more than 3 commits or touches more than one package**. Smaller work goes straight to plan mode or just gets done.

Goal: a spec a future-you (or a Claude Code session with no memory of this conversation) can pick up cold.

---

## Overview

One paragraph. What we're building, who it's for, and the user-visible change after it ships. If you can't write this paragraph yet, you're not ready to spec.

## Schema changes

Tables / views / RPCs / triggers / RLS this touches. One bullet per change. Note migration filename if known.

- `crm_<table>` — new column `foo text`, default `null`, used by … 
- `crm_<view>` — joins `…` to expose … 
- `<rpc>()` — new SECURITY DEFINER RPC, callable by `authenticated`.

Migration file: `migrations/<YYYYMMDD>_<slug>.sql`.

## Worker changes

Agents / endpoints / channels / poll loops in `packages/inbox-puller/`:

- `agents/<name>.ts` — new agent kind `<kind>` with steps: `…`, `…`, `…`. Autonomy default: approval | auto | manual.
- `server.ts` — new route `POST /api/<scope>/<thing>` (auth: JWT | none) that …
- Provider creds needed: `apify`, `hunter`, …

## SPA changes

Modules / nav / settings in `packages/crm/`:

- New module `packages/crm/src/modules/<kebab>/`. Group: `find | engage | close | intel | settings`. Reads from `crm_<table>`.
- Setting addition in `Settings.tsx`: `<key>` (admin-only).
- Inbox / Pipeline / LeadDetail tweaks: …

## Out of scope

What this spec is **not** doing. Each line should be a thing a reasonable reader might assume *is* in scope.

- Not adding tests (no test infra in this repo).
- Not changing the AI provider routing — uses the existing policy chain.
- Not extending to LinkedIn/Twitter (this is Google-Maps-only for v1).

## Open questions

Unresolved decisions. Each must have a default if no answer comes back by ship time.

- Should the auto-enrich toggle default to on or off? — *Default: on, since Hunter is configured.*
- Cost cap per smart-search run? — *Default: rely on the global `ai_monthly_cap_cents`.*

## Verification

Concrete, checkable steps to prove this shipped. Each step is either a command that returns a known value or a UI click sequence with an expected on-screen outcome.

1. `curl -sI https://crm.imbaproduction.com/` returns 200.
2. In SPA → Lead Finder → Smart search: enter `dentist Belgrade Serbia` + 50 + auto-enrich on, click Find. Within 2 min the job status banner reaches `finished` and the result grid shows ≥10 cards with website + phone (email may still be pending enrichment).
3. `select count(*) from crm_leads where source='lead-finder' and created_at > now() - interval '5 minutes'` returns ≥10.
4. `select count(*) from crm_agent_jobs where agent_kind='lead-enricher' and triggered_by like 'lead-finder:%' and created_at > now() - interval '5 minutes'` returns ≥10 (fan-out fired).
5. Within 10 min the enricher jobs finish and the cards now show email + title.

## Notes

Free-form context that doesn't fit above. Why we chose this approach over alternatives. Cost expectations. Anything that would surprise a future-you.
