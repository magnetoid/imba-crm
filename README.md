# imba-crm

AI-assisted CRM: lead funnel, inbox, AI email generation with manual approval,
proposals, invoices. Monorepo managed with pnpm workspaces.

```
packages/
  frontend/        Vite + React + Tailwind + Radix. Admin-first SPA.
  model-router/    TypeScript library + HTTP server that fans requests across
                   Anthropic, OpenAI, Google, Ollama, Deepgram, Perplexity
                   with policy-based fallbacks and cost accounting.
migrations/        One-shot SQL migrations (run manually; no migration tool wired yet).
```

## Current deployment state (2026-04-21)

There are two possible deployment stacks in this repo. **Stack A** is what
actually runs the live product; **Stack B** is what the root `Dockerfile` /
`docker-compose.yml` now cleanly builds.

### Stack A — Supabase Edge Functions (live)

Config: [packages/frontend/docker-compose.yml](packages/frontend/docker-compose.yml),
[packages/frontend/nginx/default.conf](packages/frontend/nginx/default.conf).

The frontend calls `supabase.functions.invoke('ai-proxy', ...)` and similar.
Those Edge Functions read provider credentials from the `crm_runtime_settings`
table and talk to the AI providers directly. **The Edge Function source code
is not in this repo** — it lives in your Supabase project. That's the reason
the same frontend works end-to-end even though nothing in this repo serves
`/api/ai/*`.

### Stack B — model-router HTTP server (this repo)

Config: [Dockerfile](Dockerfile), [docker-compose.yml](docker-compose.yml),
[nginx.conf](nginx.conf), [start.sh](start.sh).

The root Docker image runs two processes under one container:
- `nginx` serves the built SPA on `:80` and proxies `/api/*` to `:3000`.
- `node packages/model-router/dist/server.js` serves `/api/ai/route`,
  `/api/ai/stream`, `/api/health` on `:3000`, backed by the provider adapters
  in `packages/model-router/src/providers/`.

Provider credentials come from env vars (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, …), not the database. Optional bearer auth via
`ROUTER_API_TOKEN`.

**The frontend does not currently talk to Stack B.** It still invokes Supabase
Edge Functions. To migrate to Stack B you would:

1. Add a wrapper in [packages/frontend/src/lib/ai.ts](packages/frontend/src/lib/ai.ts)
   that `fetch('/api/ai/route', ...)` instead of `supabase.functions.invoke`.
2. Decide whether SMTP/email send also moves to a Node endpoint, or stays in
   Edge Functions.
3. Run the secret-separation migration (next section) and update both the
   Edge Functions *and* the AISettings page so keys stop flowing through the
   browser.

Pick one stack and delete the other before the next ship. Running both side
by side is a config-drift hazard.

## Development

Each package manages its own lockfile today:

```bash
# model-router (pnpm)
cd packages/model-router
pnpm install
pnpm test
pnpm build
pnpm start                # runs dist/server.js on :3000

# frontend (npm)
cd packages/frontend
npm install
npm run dev               # vite on :3000
npm run build
npm run lint
```

Root-level `pnpm -r build` will build both packages if you install pnpm at the
root and generate a root lockfile.

## Security / secrets

The `crm_runtime_settings` table currently stores AI provider API keys and the
SMTP password as regular columns. The admin UI SELECTs the row on page load,
so any authenticated admin session can read every secret.

The fix is staged in [migrations/20260421_split_provider_secrets.sql](migrations/20260421_split_provider_secrets.sql):
- Move secrets to `crm_provider_credentials` with service_role-only RLS.
- Expose a read-only `has_key` view and a `set_provider_credential(provider, key)`
  SECURITY DEFINER RPC for rotation.
- Keep the legacy columns in place until the Edge Functions and AISettings
  page are updated; drop them in a follow-up migration.

Run that migration against your Supabase project *before* relying on it in
code; the UI/Edge Function changes are a follow-up.

## Model-router API

When running Stack B (or the server directly):

```
POST /api/ai/route
Content-Type: application/json
Authorization: Bearer <ROUTER_API_TOKEN>   # required iff env var set

{
  "task": {
    "type": "drafting",
    "messages": [{ "role": "user", "content": "Draft a follow-up email for …" }],
    "systemPrompt": "You are a helpful assistant."
  },
  "policyOverride": { "drafting": [{ "provider": "openai", "modelId": "gpt-5-mini" }] },
  "providerConfigs": { "openai": { "apiKey": "…" } }
}
```

Responses follow the `RouteResult` discriminated union exported from
[`@agencycrm/model-router`](packages/model-router/src/types.ts): `{ok: true, data, event}`
or `{ok: false, error: {code, message, attempts}, event}`. HTTP 200 on success,
502 on `ALL_FALLBACKS_FAILED`, 400 on `INVALID_TASK`, 401 on auth miss.

`POST /api/ai/stream` takes the same body and returns a Server-Sent Events
stream with `data:` chunks and an `event: done` terminator.

`GET /health` returns `{"ok": true}` — used by the container healthcheck.

Cost/usage events are emitted one per call as JSON lines on stdout:

```
{"kind":"ai_call","taskType":"drafting","provider":"anthropic","model":"claude-sonnet-4-6","tokensIn":312,"tokensOut":418,"costCents":0.74,"durationMs":1123,"success":true}
```

Ship those lines into your logger of choice (Grafana Loki, Datadog, etc).

## Known gaps (Week 2+ roadmap)

- No per-org multi-tenancy on `crm_*` tables (retrofitting `org_id` + RLS is
  blocking anything multi-customer).
- No `ai_generations` audit table (model, prompt version, cost per generation).
- No prompt registry — prompts are hardcoded strings in components.
- Inbox is manual-entry only; no inbound email webhook, no IMAP, no
  open/click tracking.
- Lead search generates *synthetic* prospects; swap to Perplexity research
  with real email validation.
- No vector search / RAG over past messages + signed proposals.
- No real cost caps wired to the emitted cost events.

See `/claudecode.md` for the model-router coding rules and
`/SYSTEM_ANALYSIS_AND_ROADMAP.md` for prior analysis (now partly out of date —
most of the "High" and "Medium" items it lists are done).
