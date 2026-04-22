# Feature Analysis Report — `imba-crm`

Date: 2026-04-21

## Scope
This report reviews the current monorepo as it exists today:
- `packages/frontend`: Vite + React SPA (admin-first) using Supabase from the browser.
- `packages/model-router`: TypeScript model router + minimal HTTP server.
- Root deploy assets: `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `start.sh`.

The goal is to document:
- Current capabilities.
- Gaps/limitations (architecture, performance, security, scalability, maintainability).
- Proposed features with technical specs, complexity, priority, and effort.
- A practical roadmap with success metrics and testing requirements.

## Current System Capabilities

### Frontend (SPA)
- Public marketing pages + `/admin` area with many admin modules and a dedicated CRM section ([App.tsx](file:///Users/magnetoid/imba-crm/packages/frontend/src/App.tsx#L75-L116)).
- Admin authentication via Supabase Auth session and email/password login ([AdminLayout.tsx](file:///Users/magnetoid/imba-crm/packages/frontend/src/admin/AdminLayout.tsx#L63-L125)).
- CRM pages present (dashboard, lead detail, proposals, invoices, templates, SEO manager, AI tools) under `packages/frontend/src/admin/crm/*`.
- Data access pattern: direct `supabase.from(...).select/insert/update/delete` from the browser for most features (example: [AdminLanding.tsx](file:///Users/magnetoid/imba-crm/packages/frontend/src/admin/AdminLanding.tsx#L12-L26)).
- i18n bootstrapped with language detection and English fallback ([i18n/index.ts](file:///Users/magnetoid/imba-crm/packages/frontend/src/i18n/index.ts#L1-L23)).

### AI Features (current behavior)
There are currently two different AI execution paths in the frontend:
- **Edge Function proxy path (documented “live” path):** `supabase.functions.invoke('ai-proxy', ...)` ([ai.ts](file:///Users/magnetoid/imba-crm/packages/frontend/src/lib/ai.ts#L87-L102)) and described in [README.md](file:///Users/magnetoid/imba-crm/README.md#L21-L31).
- **Direct browser-to-provider calls:** several components call Anthropic directly from the browser and set `anthropic-dangerous-allow-browser: 'true'` (examples: [SEOManager.tsx](file:///Users/magnetoid/imba-crm/packages/frontend/src/admin/crm/SEOManager.tsx#L121-L138), [BlogAdmin.tsx](file:///Users/magnetoid/imba-crm/packages/frontend/src/admin/BlogAdmin.tsx#L206-L229), [TranslationsAdmin.tsx](file:///Users/magnetoid/imba-crm/packages/frontend/src/admin/TranslationsAdmin.tsx#L108-L142)).

### Model Router (library + HTTP server)
- Provider adapter pattern with registry and fallbacks ([providers/index.ts](file:///Users/magnetoid/imba-crm/packages/model-router/src/providers/index.ts#L11-L26), [router.ts](file:///Users/magnetoid/imba-crm/packages/model-router/src/router.ts#L106-L185)).
- Separate streaming method using SSE (`/api/ai/stream`) ([server.ts](file:///Users/magnetoid/imba-crm/packages/model-router/src/server.ts#L103-L129)).
- Policy-driven routing via default task→chain mapping ([default.ts](file:///Users/magnetoid/imba-crm/packages/model-router/src/policies/default.ts#L3-L38)).
- Deterministic cost accounting via model pricing table ([cost.ts](file:///Users/magnetoid/imba-crm/packages/model-router/src/cost.ts#L10-L68)).
- Test suite present and passing for model-router (47/47) (see `pnpm test` in `packages/model-router`).

### Deployment (today)
Repo documents two possible stacks:
- **Stack A (live):** Frontend → Supabase Edge Functions (Edge function code not in repo) ([README.md](file:///Users/magnetoid/imba-crm/README.md#L21-L31)).
- **Stack B (in-repo):** Nginx serves SPA and proxies `/api/*` to the model-router server ([README.md](file:///Users/magnetoid/imba-crm/README.md#L33-L60), [nginx.conf](file:///Users/magnetoid/imba-crm/nginx.conf#L1-L63), [start.sh](file:///Users/magnetoid/imba-crm/start.sh#L1-L8)).

## Architecture & Implementation Patterns

### Trust boundaries
- Frontend trusts Supabase auth session and uses browser-side Supabase client heavily ([supabase.ts](file:///Users/magnetoid/imba-crm/packages/frontend/src/lib/supabase.ts#L3-L21)).
- Several admin checks rely on `user_metadata.role` both in SQL and in the frontend (see Security section below).

### Pattern: “Direct DB from browser”
- Advantages: fast iteration; fewer backend services.
- Costs: pushes most security/scalability burden into RLS correctness, indexing, and strict role verification.

### Pattern: “Two AI stacks”
- Current state runs two paths (Edge Functions and model-router) which increases config drift and makes auditing/cost caps harder to guarantee ([README.md](file:///Users/magnetoid/imba-crm/README.md#L48-L60)).

## Gaps / Limitations (with evidence)

### Security

#### 1) Provider keys and SMTP password can reach the browser
- `CRMRuntimeSettings` includes `*_api_key` and `smtp_password`, and the UI selects the entire row in the browser ([ai.ts](file:///Users/magnetoid/imba-crm/packages/frontend/src/lib/ai.ts#L13-L140)).
- AI settings page upserts these settings from the browser ([AISettings.tsx](file:///Users/magnetoid/imba-crm/packages/frontend/src/admin/crm/AISettings.tsx#L46-L68)).
- Migration to fix this exists but is not wired in UI yet: [20260421_split_provider_secrets.sql](file:///Users/magnetoid/imba-crm/migrations/20260421_split_provider_secrets.sql).

#### 2) Direct browser → AI provider calls
- Multiple modules call Anthropic directly from the browser and explicitly opt into “dangerous allow browser” ([SEOManager.tsx](file:///Users/magnetoid/imba-crm/packages/frontend/src/admin/crm/SEOManager.tsx#L121-L138), [BlogAdmin.tsx](file:///Users/magnetoid/imba-crm/packages/frontend/src/admin/BlogAdmin.tsx#L206-L229)).

#### 3) Admin privilege model likely unsafe
- SQL admin function trusts `auth.jwt()->'user_metadata'->>'role' = 'admin'` ([init.sql](file:///Users/magnetoid/imba-crm/packages/frontend/scripts/init.sql#L200-L228)).
- Frontend also trusts `session.user.user_metadata.role` ([adminPermissions.ts](file:///Users/magnetoid/imba-crm/packages/frontend/src/admin/utils/adminPermissions.ts#L7-L16)).
- In many auth systems, `user_metadata` is user-controlled; if so, this becomes a privilege escalation.

#### 4) Model-router HTTP surface is risky if exposed
- Auth is optional unless `ROUTER_API_TOKEN` is set ([server.ts](file:///Users/magnetoid/imba-crm/packages/model-router/src/server.ts#L66-L70)).
- Callers can send `providerConfigs` and `policyOverride` ([server.ts](file:///Users/magnetoid/imba-crm/packages/model-router/src/server.ts#L72-L100)).
- Providers `fetch(config.baseUrl)` directly (example: [openai.ts](file:///Users/magnetoid/imba-crm/packages/model-router/src/providers/openai.ts#L116-L145)).
- This can become an SSRF/cost-exhaustion primitive if reachable from untrusted networks.

### Performance

#### Frontend bundle size and chunking
A production build shows a very large main JS chunk:
- `dist/assets/index-*.js` ≈ 1.45 MB (gzip ≈ 424 KB), and Vite warns about chunks > 500 KB.
- This implies slow first load, especially on mobile.

#### Dependency health
`npm ci` reports deprecations and `npm audit` reports **10 vulnerabilities (6 high)** in the frontend dependency tree.

### Scalability
- No multi-tenant `org_id` model on `crm_*` tables is explicitly listed as a known gap ([README.md](file:///Users/magnetoid/imba-crm/README.md#L139-L151)).
- Many queries are unscoped/potentially unpaginated in CRM tables (example: [Proposals.tsx](file:///Users/magnetoid/imba-crm/packages/frontend/src/admin/crm/Proposals.tsx#L81-L90)).

### Maintainability
- Tooling is split: `packages/model-router` uses pnpm + Vitest; `packages/frontend` uses npm + ESLint; root Dockerfile uses pnpm to build both.
- Running both Stack A and Stack B in parallel is documented as a “config-drift hazard” ([README.md](file:///Users/magnetoid/imba-crm/README.md#L59-L60)).

## Proposed Features (Specs, Complexity, Priority, Effort)

Legend:
- Priority: P0 (ship-blocking), P1 (high value), P2 (nice-to-have).
- Complexity: S/M/L.
- Effort: engineer-days (1 dev) excluding external approvals.

### P0 — Security & Reliability

1) **Secret separation + key rotation UX**
- Spec: Apply [20260421_split_provider_secrets.sql](file:///Users/magnetoid/imba-crm/migrations/20260421_split_provider_secrets.sql). Update UI so it never SELECTs secrets; show only `has_key` and last-rotated timestamp; rotate via `set_provider_credential()`.
- Complexity: M
- Effort: 3–5 days
- Success: No provider keys/smtp password reachable from the browser; verified via network inspector and RLS tests.

2) **Remove direct browser-to-provider AI calls**
- Spec: Replace all direct `fetch('https://api.anthropic.com/...')` with a single client `callAI()` that hits either (A) an Edge Function proxy or (B) `/api/ai/route` in Stack B.
- Complexity: M
- Effort: 2–4 days
- Success: No requests from browser to provider domains; all AI traffic goes through a controlled proxy.

3) **Fix admin trust model (no `user_metadata` for authorization)**
- Spec: Replace `is_admin()` to check a server-controlled role source (allowlist table or `app_metadata`). Update frontend guard to match.
- Complexity: M
- Effort: 2–3 days
- Success: Non-admin cannot elevate by editing user metadata; verified with an integration test.

4) **Lock down model-router HTTP surface**
- Spec: In production, require `ROUTER_API_TOKEN`. Reject request-supplied `providerConfigs` and `baseUrl` except in explicit debug mode; add hostname allowlists and block private/link-local IPs.
- Complexity: M
- Effort: 2–4 days
- Success: SSRF test cases blocked; no unauthenticated access to `/api/ai/*`.

### P1 — Core CRM Value

5) **AI generation audit log (`ai_generations` table)**
- Spec: Store: task type, prompt id/version, provider/model, tokens/cost, latency, user_id, org_id, input hash, output summary, error.
- Complexity: M
- Effort: 3–6 days
- Success: Every AI call produces a durable record; dashboard can show cost by org/time.

6) **Prompt registry + prompt versioning**
- Spec: Table-backed prompts with versions; UI editor for admins; code references prompt IDs (not hardcoded strings).
- Complexity: M
- Effort: 4–7 days
- Success: Prompt updates ship without redeploy; rollbacks possible.

7) **Per-org multi-tenancy**
- Spec: Introduce `orgs`, `org_members`, add `org_id` to CRM tables, enforce RLS; migrate existing data.
- Complexity: L
- Effort: 10–20 days
- Success: Cross-org access impossible; verified with RLS tests and UI org switch.

8) **Inbox ingestion (webhook first)**
- Spec: Start with SendGrid/Mailgun inbound parse webhook → store messages → show in AI Inbox; optional IMAP later.
- Complexity: L
- Effort: 10–15 days
- Success: Inbound email appears in inbox within 30s; threading works.

### P1 — UX & Performance

9) **Route-based code splitting (admin modules)**
- Spec: Convert `react-router-dom` routes to lazy imports; chunk by feature area (CRM, Blog, Media).
- Complexity: S
- Effort: 1–2 days
- Success: Main JS chunk drops below 500KB; improved LCP.

10) **List pagination + server-side filtering**
- Spec: For leads/proposals/invoices: pagination, search, filters; DB indexes added for frequent query patterns.
- Complexity: M
- Effort: 4–8 days
- Success: List pages remain fast at 100k rows; API/DB query times < 200ms.

11) **Error boundaries + observability in UI**
- Spec: Add global error boundary, capture to a logging sink (Sentry/etc), add user-friendly empty/error states.
- Complexity: S
- Effort: 1–3 days
- Success: No “blank screen” failures; actionable crash reports.

### P2 — Integrations & Growth

12) **Email outreach tracking (open/click)**
- Spec: Link tracking via redirect endpoint; pixel for opens; store events in DB.
- Complexity: M
- Effort: 5–10 days

13) **Calendar integration**
- Spec: Google Calendar sync for scheduled calls; store activities.
- Complexity: M
- Effort: 5–10 days

14) **Billing integration**
- Spec: Stripe for subscriptions; enforce per-org cost ceilings and feature gating.
- Complexity: L
- Effort: 10–20 days

15) **RAG over past emails/proposals**
- Spec: Embedding pipeline + vector store (in Supabase pgvector or external) + retrieval for drafting/reasoning tasks.
- Complexity: L
- Effort: 15–30 days

## Roadmap (Pragmatic)

### Phase 0 (Week 1) — Stop key leaks + stabilize
- Complete P0 items 1–4.
- Decide Stack A vs Stack B for AI and delete the other stack’s code paths.
- Success metrics:
  - No provider-domain requests from the browser.
  - No secrets returned to browser network panel.
  - Admin role cannot be forged.

### Phase 1 (Weeks 2–4) — Product instrumentation
- Implement `ai_generations` and prompt registry.
- Add UI error boundary + basic monitoring.
- Start performance work: route-based code splitting.

### Phase 2 (Weeks 5–8) — Multi-tenancy foundation
- `org_id` + RLS; migrate existing data; org membership UI.

### Phase 3 (Weeks 9+) — Inbox automation + integrations
- Inbound email webhook ingestion and tracking.
- Optional: RAG and billing gates.

## Testing Requirements

### Model-router
- Keep Vitest unit tests; add SSRF/allowlist tests for each provider baseUrl.
- Add tests that enforce “no request-provided providerConfigs in prod mode”.

### Frontend
- Add at least:
  - E2E smoke tests (Playwright) for login, admin navigation, CRM lead list, AI action.
  - Contract tests for the AI proxy endpoint (Edge Function or `/api/ai/*`).

### Security
- Automated checks:
  - secret scanning (repo + runtime config).
  - dependency audit CI gate for “high” vulnerabilities.

## Appendix — Notable Files
- Repo overview & known gaps: [README.md](file:///Users/magnetoid/imba-crm/README.md)
- Frontend AI wrapper: [ai.ts](file:///Users/magnetoid/imba-crm/packages/frontend/src/lib/ai.ts)
- Direct browser Anthropic call example: [SEOManager.tsx](file:///Users/magnetoid/imba-crm/packages/frontend/src/admin/crm/SEOManager.tsx)
- Secret separation migration: [20260421_split_provider_secrets.sql](file:///Users/magnetoid/imba-crm/migrations/20260421_split_provider_secrets.sql)
- Model-router server: [server.ts](file:///Users/magnetoid/imba-crm/packages/model-router/src/server.ts)
- Model-router router core: [router.ts](file:///Users/magnetoid/imba-crm/packages/model-router/src/router.ts)
