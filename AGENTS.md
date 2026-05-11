# Agent workflow — imba-crm

How AI agents (Claude Code, subagents, future MCP clients) should run a unit of work in this repo. Companion to `CLAUDE.md`.

## The loop

Every task — bug fix, feature, refactor — runs through six phases. Skipping phases is how things break.

### 1. Understand

- Read the user's request twice.
- Open the *one* file that's actually on the critical path (the module being changed, the agent being extended, the table being migrated). Don't grep the whole repo.
- Check `memory/MEMORY.md` for entries that touch this area.
- If the task is unfamiliar, run a single targeted `grep` or `Glob` — don't speculate on file paths.

### 2. Plan

- For one-or-two-file changes: skip. Just do it.
- For non-trivial work (new module, new agent kind, multi-table migration, anything spanning 3+ files): use plan mode. The plan lands at `~/.claude/plans/<slug>.md`.
- For phase-level work: write a spec at `docs/specs/<YYYYMMDD>-<slug>.md` using `docs/spec-template.md`.

### 3. Build

- **Edit existing files over creating new ones.** A new file needs a real reason.
- **Atomic chunks.** Each chunk should leave the repo in a buildable state. Never commit a half-implementation.
- **No comments narrating the task.** ("Added for the lead-finder fix" rots; the diff already says that.) Only comment a hidden invariant or workaround.
- Match the conventions of the file you're editing — not your own preferences.

### 4. Verify

- `pnpm --filter @imba/crm build` (covers TS strict-mode typecheck + bundle).
- `pnpm --filter @imba/inbox-puller build` (covers worker typecheck + bundle).
- Both must succeed before commit. The pre-commit hook enforces this.
- If a hook fails, fix the underlying issue. Never `--no-verify`.

### 5. Migrate (if schema changed)

- Apply via the SSH+psql template (see `memory/reference_deployment.md`).
- Confirm the apply output (`BEGIN; … COMMIT` lines, no `ERROR`).
- Spot-check one row of the affected table in production via `psql` or Supabase Studio.

### 6. Ship

- Conventional commit subject: `feat(scope):`, `fix(scope):`, `chore(scope):`, etc.
- Body explains the *why*, not the *what* (the diff says the what).
- `git push`. Coolify deploys within ~2-3 minutes.
- For user-visible UI changes: hit the live URL after deploy completes to confirm.

## Tool budgets

- **Subagents** — use them for parallel research or focused execution. Don't spawn a subagent for work you can do in two tool calls.
- **Agent calls cost money.** The `ai_monthly_cap_cents` gate at the runtime level is your circuit breaker, but it's downstream of the damage. Don't queue a `prospect-pipeline` run for 1000 leads in a debugging session.
- **Browser sessions** (Browserbase) — long-running, billed per minute. Don't leave them open.
- **Apify actor runs** — `compass/crawler-google-places` is fine; some scrapers cost real money. Check the actor's pricing tab before kicking off > 50 items.

## Stop-and-ask list

These are not your call to make. Surface the proposed action and wait:

- `drop table`, `drop column`, `truncate`, `delete from … where true`.
- `git push --force`, `git reset --hard` on `main`.
- Rotating any secret (JWT, service key, SSH password, provider API keys).
- Editing Coolify project settings, Plesk vhost config, or DNS.
- Any single action expected to cost > $5 in agent / AI / Apify spend.
- Disabling RLS on a `crm_*` table.

## When you're stuck

- **Build fails with no obvious cause** → `pnpm install` at the repo root. Stale `node_modules` after a workspace edit is the usual culprit.
- **SPA loads but a query returns `null` with no error** → it's almost always RLS. Try the same query as `service_role` via the worker; if it returns rows there's the diagnosis.
- **Worker job stuck in `running`** → the runtime crashed mid-step. Check `docker logs inbox-puller` for the JSON line where the run started; the next-but-not-finished step is the culprit.
- **AI provider call fails with auth error** → re-check via `list_provider_credentials` RPC, not by reading the table directly (RLS).

## What "good" looks like

A finished task leaves:
- A single conventional commit (or a small batch if the user asked for one push).
- The build green.
- The migration applied (if any).
- A working production URL.
- Memory updated if a non-obvious fact was learned (a new RPC name, a new schema invariant, a footgun avoided).
