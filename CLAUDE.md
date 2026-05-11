# imba-crm — project constitution for AI agents

This file is auto-loaded by Claude Code at the start of every session. Read once, follow always. Supersedes the older `claudecode.md` (which was scoped to the model-router package only and has been removed).

## Stack

- **Type**: pnpm monorepo, ESM-only, TypeScript strict everywhere.
- **Packages**:
  - `packages/crm` — primary SPA, served at `crm.imbaproduction.com`. React 18 + Vite + shadcn/ui + Tailwind. The thing operators use.
  - `packages/inbox-puller` — Node 20 worker (Hono server + agent runtime + IMAP/POP3 pullers + SMTP sender). Container name `inbox-puller`.
  - `packages/shared` — cross-package types, supabase client, integrations (`apify`, `hunter`, `apollo`, `cal`, `loom`, `mailreach`, `browserbase`), AI helper, UI primitives.
  - `packages/widget` — embeddable chat widget JS (`widget.js` bootstrapped on imbaproduction.com).
  - `packages/model-router` — model-router library (decoupled, predates the v2 work — touch sparingly).
  - `packages/frontend` — legacy admin SPA (mostly unused; do not extend).
- **Datastore**: self-hosted Supabase (Postgres 15 + GoTrue + Kong + Storage) inside the same Coolify project. ~40 `crm_*` tables, several `crm_*` views, several SECURITY DEFINER RPCs. RLS on every user-facing table.
- **Deploy**: Coolify on `tetra.imbamarketing.com`. **Push to `main` = production deploy.** No staging.

## Architecture pointers (where things live)

| You want to … | Path |
|---|---|
| Add or change an agent kind | `packages/inbox-puller/src/agents/<name>.ts` + register in `packages/inbox-puller/src/agents/registry.ts` |
| Add a CRM module | `packages/crm/src/modules/<name>/{<Name>.tsx,index.ts}` + register in `packages/crm/src/modules/registry.ts` |
| Add a typed external API client | `packages/shared/src/integrations/<provider>.ts` |
| Write a DB schema change | `migrations/YYYYMMDD_<short_desc>.sql` |
| Mount a new worker endpoint | `packages/inbox-puller/src/server.ts` (Hono routes) |
| Add a Nomo tool | `packages/inbox-puller/src/nomo-tools.ts` |
| Wire SPA nginx route | `packages/crm/nginx/default.conf` |

## Reject on sight

If the user asks for any of these, push back — they don't belong in this repo:

- **Prisma / TypeORM / Drizzle** — we use `@supabase/supabase-js` directly. The Postgres schema is the source of truth, not a TS generator.
- **LangChain / LlamaIndex / CrewAI / agno** — agent orchestration lives in `crm_agent_jobs` + `crm_agent_runs` and the in-house `runtime.ts` step wrapper. No framework.
- **Axios / node-fetch / got** — native `fetch` only (Node 20 has it).
- **Jest** — there is no test suite. Verify via `pnpm -r build` (typecheck happens during build).
- **`any` types** — use `unknown` + narrowing, or define a local interface. `any` is a code-review reject.
- **Reading env vars at module-import time** — defer to first call. Module imports must have zero I/O.
- **Service-role keys in the SPA** — only the worker holds the service key. SPA uses the user JWT + RLS.

## Migration rules (non-negotiable)

Every file in `migrations/` must:

1. **Be transactional** — wrapped in `begin; … commit;`. A partial migration must roll back cleanly.
2. **Be idempotent** — `create table if not exists`, `create or replace function`, `drop trigger if exists` before `create trigger`, `on conflict do nothing` on seed inserts.
3. **Include RLS** on any new user-facing table — at minimum a read policy for `authenticated` and a service-role bypass policy.
4. **Be applied via the SSH+psql template** in `~/.claude/projects/-Users-magnetoid-imba-crm/memory/reference_deployment.md`. Use `-h 127.0.0.1` and `ON_ERROR_STOP=1`. Never paste DDL into the Supabase Studio.
5. **Never `drop table`** without first asking the user. Same for column drops.

The `compute_thread_key()` fix in `migrations/20260603_fix_mega_threads.sql` is a good shape to copy: idempotent, contains the *why* in a top header comment, and includes a backfill step.

## Worker rules

- **Every agent is a function**: `export async function runX(ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>>`.
- **Every meaningful step uses `ctx.step(name, input, async () => { ... })`** so the run lands in `crm_agent_runs` for audit + cost tracking. See `packages/inbox-puller/src/agents/lead-finder.ts` as the canonical example.
- **Provider credentials**: always `await loadProviderCredential('apify' | 'hunter' | …)`. Never `process.env.APIFY_TOKEN`. The whitelist is enforced by `crm_provider_credentials_provider_check` — extend it via migration when adding a new integration.
- **JWT-gated endpoints** follow the pattern in `packages/inbox-puller/src/inbox-ai.ts:23-44` — `JWT_SECRET` HMAC verify + `app.use('/api/<scope>/*', verifyAuth)`.
- **Logs are structured JSON** (level, msg, source, time). No `console.log` in green code.

## SPA rules

- **Modules**: each is a directory in `packages/crm/src/modules/<name>/` with `<Name>.tsx` (default-exported component) and `index.ts` (re-export). Register in `packages/crm/src/modules/registry.ts`.
- **Reading provider creds**: use the `list_provider_credentials` RPC (security-definer). Direct `from('crm_provider_credentials').select()` returns null under RLS. See `packages/crm/src/modules/lead-finder/LeadFinder.tsx:SmartSearchPane` for the right pattern.
- **AI calls**: use `callAIJSON()` from `@imba/shared/lib/ai` — it routes through the worker's `/api/ai/*` proxy, respects the monthly cap, and logs to `ai_generations`. Never POST directly to Anthropic/OpenAI from the SPA.
- **Mutations should `logActivity()`** when the change is operator-visible (lead state, outreach, calls) so the activity timeline stays complete.
- **shadcn primitives** (`@imba/shared/ui/*`) over raw HTML. We have: `button`, `input`, `label`, `badge`, `textarea`, `select`, `separator`, `switch`, `checkbox`, `card`, `dialog`, `dropdown-menu`, `popover`, `sheet`, `tooltip`, plus a few custom (`scroll-area`, `tabs`).

## Done means deployed

- `pnpm --filter @imba/crm build` succeeds.
- `pnpm --filter @imba/inbox-puller build` succeeds.
- Migration applied to production if schema changed.
- Commit + `git push`. Coolify auto-deploys both SPA and worker within ~2-3 minutes.
- Verify the live URL if it's a user-visible change (curl, or click through the deployed UI).

A green typecheck on the dev branch is **not done**. The user expects autonomous batches: edit → build → migrate → commit → push — without per-step confirmation. (See `feedback_execution_style` in memory.)

## When to stop and ask

- `drop table`, `drop column`, `truncate`.
- `git push --force`, `git reset --hard` against `main`.
- Touching the Plesk vhost config or Coolify project settings.
- Rotating secrets (JWT, service key, SSH password) — these are shared with non-CRM services.
- Anything that costs >$5 of agent / AI / Apify spend in a single run.

## Auto-memory

Persistent memory lives at `~/.claude/projects/-Users-magnetoid-imba-crm/memory/`. Read `MEMORY.md` first; honor the feedback entries (especially `feedback_execution_style.md`); update entries that have gone stale rather than writing duplicates.
