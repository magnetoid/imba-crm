# System Analysis & Improvement Roadmap

> **Status note (2026-04-21):** The prior version of this document described
> the model-router as "skeletal prototype with only Anthropic implemented."
> That snapshot is out of date — all six providers are wired up and have a
> baseline test suite. This file now tracks what's actually left.

Authoritative overview lives in [README.md](README.md). This file tracks the
longer-term improvement plan. For the weekly plan, see the "Roadmap" section
at the bottom of the repo-wide code review in the project chat history.

## What shipped (closed out)

- All six providers: Anthropic, OpenAI, Google, Ollama, Deepgram, Perplexity.
- `route()` + `stream()` in `src/router.ts`.
- Default policy covers all eight task types (voyage removed — no adapter).
- Provider responses validated with Zod at the network edge
  (`openai.ts`, `google.ts`, `anthropic.ts`).
- HTTP server entry point at `packages/model-router/src/server.ts` + tsup
  secondary entry, so the root Docker image actually has something for
  `/api/ai/*` to reach.
- Root nginx hardened with security headers + gzip + SPA fallback + health
  endpoint.
- Frontend: error boundary, `react-hooks/exhaustive-deps` re-enabled and
  code fixed, overdue-invoice write-in-effect removed.

## Still open — high priority

| Area | Item | Notes |
|------|------|-------|
| Integration | Frontend still talks to Supabase Edge Functions, not the model-router server. | Decide: migrate to Stack B, or delete Stack B. Running both drifts. |
| Secrets | API keys readable by any admin session via `crm_runtime_settings`. | Migration [`migrations/20260421_split_provider_secrets.sql`](migrations/20260421_split_provider_secrets.sql) staged; apply + update Edge Functions + AISettings. |
| Audit | No per-generation provenance (model/prompt/cost/who-approved/diff). | Introduce `ai_generations` table. Core to an approval-based product. |
| Prompts | Hardcoded in components (AIOutreach, AIInbox, LeadDetail, crm-utils…). | Add `prompts(id, key, version, template)`; helper `renderPrompt(key, vars)`. |
| Cost | Model-router emits cost events; nothing enforces caps. | Per-org daily/monthly limit in the API layer; circuit-breaker. |
| Multi-tenancy | Single `crm_runtime_settings` row (`id=1`). No `org_id` on CRM tables. | Retrofit before customer zero. Otherwise migration pain. |

## Still open — medium

- Real inbound email (Mailgun/Postmark webhook + MIME parse + thread match).
- Real open/click tracking (tracking pixel + link rewrite) — today "Mark
  opened" is a human click.
- Swap synthetic lead generator for Perplexity `research` + email validation.
- pgvector + RAG on messages, leads, signed proposals.
- Supabase Realtime for inbox + pipeline.
- CI pipeline (`.github/workflows/ci.yml`): lint + typecheck + test + docker
  build per PR.
- Shared pnpm lockfile at the repo root (frontend currently uses npm,
  model-router uses pnpm; Dockerfile expects pnpm).

## Provider / router polish (low)

- Add streaming method to Anthropic provider.
- Replace global `configure()` state with `createRouter({...})` factory
  (current singleton violates the `claudecode.md` anti-pattern list).
- Per-chain deadline on `route()` instead of per-attempt timeout.
- Pino logger across the router (currently only stdout JSON lines).
- Expand `biome.json` to enforce style rules; currently minimal.
