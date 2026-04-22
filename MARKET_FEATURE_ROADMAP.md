# Market + Competitive Feature Roadmap — `imba-crm`

Date: 2026-04-21

## Executive Summary
Across AI-native CRMs and sales tools, the strongest trend is **agentic workflows with guardrails** (AI that can take actions, but within explicit limits), plus **deep context** from email/calendar and unstructured sources. HubSpot is explicitly positioning “hybrid human–AI teams” with specialized agents like a Prospecting Agent and an Assistant with memory + web research + app connections ([HubSpot Spotlight 2025](https://www.hubspot.com/company-news/fall-2025-spotlight?id=74), [HubSpot Breeze](https://blog.hubspot.com/marketing/breeze-future-of-gtm)). Microsoft’s Copilot for Sales similarly emphasizes an agent “daily command center” and autonomous lead qualification and prioritization ([Microsoft Copilot for Sales 2026 wave 1](https://learn.microsoft.com/ko-kr/copilot/release-plan/2026wave1/copilot-sales/)). Salesforce is leaning into “Agentic Enterprise” and AI agents grounded in Customer 360 context ([Salesforce Agentic Enterprise announcement](https://www.salesforce.com/uk/news/press-releases/2025/10/13/agentic-enterprise-announcement/)). Modern CRMs like Attio differentiate with **email/calendar syncing** that automatically populates and enriches records ([Attio email & calendar syncing](https://attio.com/help/reference/email-calendar/email-and-calendar-syncing)).

Given the current `imba-crm` codebase (SPA + Supabase + model-router), the best next innovations are:
- A **guardrailed AI Copilot** that can draft, summarize, and propose actions across CRM objects.
- A **signals-driven prospecting + enrichment** loop that produces real prospects (not synthetic).
- A **unified inbox** ingestion pipeline (webhooks first) with human approval for outbound.
- Strong **AI governance**: secrets isolation, audit trails, cost caps, and policy.

## Method
This roadmap is derived from:
- Competitive messaging and product capabilities from major CRM AI vendors (HubSpot, Microsoft, Salesforce) and AI-native CRMs (Attio) via public sources.
- “User feedback” proxies from common buyer complaints in the CRM category: manual data entry, brittle sequences, poor deliverability/ROI attribution, unclear AI costs, and missing governance.
- Technical feasibility mapped to your repo architecture (React SPA + Supabase, model-router service).

## Current Product Baseline (relevant to roadmap)
- Admin-first CRM SPA with dedicated CRM modules under `packages/frontend/src/admin/crm/*`.
- AI features exist but are split across **Edge Function proxy** calls and **unsafe direct browser→provider calls**.
- model-router already supports multi-provider fallback, streaming, and cost estimation.
- Known foundational gaps: multi-tenancy (`org_id`), AI audit logging, prompt registry, cost caps (see [README.md](file:///Users/magnetoid/imba-crm/README.md)).

## Prioritized Feature List (8 features)

### 1) P0 — AI Governance Layer (Secrets + Audit + Cost Caps)
**Why now**: Competitive landscape is moving toward agentic workflows; without governance, agentic features will leak secrets and create unpredictable spend.

**Spec**
- Apply secret isolation: move provider keys out of browser-readable settings and into a service-role only store.
- Add `ai_generations` audit table: record task type, provider/model, tokens, cost, latency, user_id, org_id, and prompt version.
- Implement per-org spend caps (hard and soft): deny, degrade to cheaper model, or require manual approval.

**User stories**
- As an admin, I can rotate AI provider keys without revealing them to the browser.
- As an owner, I can see AI spend by org and set monthly caps.
- As a manager, I can trace any AI output back to prompt/version/model.

**Wireframe (AI governance settings)**
```text
AI Settings
-------------------------------------------------
Providers
  Anthropic   [Connected ✓]   [Rotate Key]
  OpenAI      [Missing  ✕]    [Add Key]
  Google      [Connected ✓]   [Rotate Key]

Cost Controls
  Monthly cap (org)   [$500]  [Save]
  Soft cap warning    [$350]  [Save]
  When cap hit: (•) Block  ( ) Downgrade model  ( ) Require approval

Audit
  [View AI Generations]  [Export CSV]
-------------------------------------------------
```

**Acceptance criteria**
- No provider API keys/SMPP password appear in browser network responses or localStorage.
- Every AI call creates an `ai_generations` row within 1s of completion.
- When a cap is exceeded, AI actions are blocked or downgraded deterministically.

**Tech feasibility**: High (fits current migration path + model-router events). Requires DB changes + Edge Function/server updates.

**Effort**: 5–10 engineer-days.

---

### 2) P0 — Unified AI Execution Path (Kill direct browser→provider)
**Why now**: Direct browser provider calls break governance and leak keys.

**Spec**
- Standardize all AI calls through one path:
  - Option A: Supabase Edge Function `ai-proxy`
  - Option B: `model-router` `/api/ai/route` + `/api/ai/stream` behind Plesk/Coolify
- Update frontend `callAI()` to exclusively use that path.
- Remove all direct provider fetches from UI modules.

**User stories**
- As a user, AI features work consistently across pages.
- As an admin, AI usage is tracked and governed in one place.

**Wireframe (AI action panel)**
```text
Lead: Acme Inc.
---------------------------------------
[Summarize] [Draft Follow-up] [Research]

Draft Output
---------------------------------------
Subject: ...
Body: ...

[Approve & Send]  [Edit]  [Discard]
---------------------------------------
```

**Acceptance criteria**
- Browser never calls provider domains.
- Feature parity: SEO, translations, blog, outreach all route via the unified path.

**Tech feasibility**: High.

**Effort**: 3–6 engineer-days.

---

### 3) P1 — Signals-Driven Prospecting Agent (Human-in-the-loop)
**Market signal**: Prospecting agents are becoming standard in GTM suites ([HubSpot Spotlight 2025](https://www.hubspot.com/company-news/fall-2025-spotlight?id=74)).

**Spec**
- Inputs: ICP definition, geo/industry, exclusions, budget.
- “Signals” sources:
  - Web research provider (e.g., Perplexity) for funding, hiring, intent.
  - Enrichment provider(s) (Apollo/Clearbit alternative, or custom).
- Output: a ranked list of prospects with evidence links and recommended outreach angle.
- Requires manual approval before adding to CRM.

**User stories**
- As a salesperson, I can generate a weekly list of high-intent prospects.
- As a manager, I can approve/reject prospects before they enter the database.

**Wireframe (Prospecting queue)**
```text
Prospecting Queue
-------------------------------------------------
ICP: [Agency owners, US, 5-50 employees]
[Run search] [Schedule weekly]

Prospects (Ranked)
1. Acme Agency   Score 92   Signals: funding, hiring
   Evidence: [link] [link]   Angle: "Congrats on funding..."
   [Approve] [Reject]

2. Bright Co     Score 81   Signals: new website launch
   [Approve] [Reject]
-------------------------------------------------
```

**Acceptance criteria**
- Each prospect shows at least 2 evidence citations.
- Approved prospects become Leads with source metadata.
- Full run produces results in < 60 seconds for 50 prospects.

**Tech feasibility**: Medium. Needs robust research + enrichment connectors and dedupe.

**Effort**: 10–15 engineer-days.

---

### 4) P1 — Email + Calendar Sync (Relationship Graph)
**Competitive anchor**: Email/calendar syncing and auto-record creation is a core differentiator for AI-native CRMs ([Attio email & calendar syncing](https://attio.com/help/reference/email-calendar/email-and-calendar-syncing)).

**Spec**
- Connect Google/Microsoft accounts via OAuth.
- Ingest metadata (from/to, subject, timestamps; content optional behind permission).
- Auto-create contacts/companies and link interactions.
- Derive relationship strength score.

**User stories**
- As a user, my CRM stays updated without manual data entry.
- As a manager, I can see engagement recency and strength.

**Wireframe (Lead timeline)**
```text
Lead: Acme Inc.   Relationship: Strong ▲
-------------------------------------------------
Timeline
  Apr 20  Email sent  "Proposal follow-up"  (You)
  Apr 18  Meeting     "Discovery call"      (30m)
  Apr 10  Email recv  "Re: pricing"         (Acme)

[Log manual note] [Create task]
-------------------------------------------------
```

**Acceptance criteria**
- OAuth connection persists and refreshes tokens.
- New emails/meetings appear within 2 minutes.
- No sensitive email content stored unless enabled.

**Tech feasibility**: Medium–High. Needs backend ingestion jobs/webhooks.

**Effort**: 12–20 engineer-days.

---

### 5) P1 — AI Inbox: Inbound Email Webhooks + Threading
**Why**: Your current inbox is manual-entry only (repo known gap). Market is moving to agentic inbox workflows.

**Spec**
- Start with inbound email parse webhooks (SendGrid/Mailgun).
- Store messages, link to lead/contact, thread by Message-ID/References.
- Provide AI summary, suggested reply, and “draft send” workflow.

**User stories**
- As a user, inbound emails show up automatically and link to leads.
- As a user, I can generate a reply draft and approve it.

**Wireframe (Inbox thread + AI reply)**
```text
Inbox ▸ Acme Inc.
-------------------------------------------------
Thread
  Acme: "Can you send pricing?"
  You : "Sure — attached..."

AI
  Summary: ...
  Suggested reply:
  [editable textarea]

[Approve & Send] [Schedule Send] [Discard]
-------------------------------------------------
```

**Acceptance criteria**
- Webhook ingestion is idempotent and deduped.
- Replies are never sent without explicit approval.

**Tech feasibility**: Medium.

**Effort**: 10–14 engineer-days.

---

### 6) P2 — Proposal Composer + E-sign + Payments
**Why**: Many agency CRMs win by closing the loop from lead → proposal → invoice → payment.

**Spec**
- Proposal templates with variables.
- Generate proposal drafts via AI with strict “no hidden prompting” rules.
- Integrate e-sign (DocuSign/Dropbox Sign) and payments (Stripe).

**User stories**
- As a user, I can generate a proposal from lead notes and a template.
- As a client, I can sign and pay from one link.

**Wireframe (Proposal builder)**
```text
Proposal: Acme Inc.
-------------------------------------------------
Template: [Agency Retainer v3 ▼]   [Generate draft]

[Editor]

[Preview] [Send for signature] [Create invoice]
-------------------------------------------------
```

**Acceptance criteria**
- Signed status updates in CRM within 1 minute.
- Payment status syncs and updates invoice.

**Tech feasibility**: Medium.

**Effort**: 12–18 engineer-days.

---

### 7) P2 — AI Copilot “Command Bar” Across CRM
**Competitive anchor**: Conversational command centers and assistants are standardizing ([Microsoft Copilot for Sales 2026 wave 1](https://learn.microsoft.com/ko-kr/copilot/release-plan/2026wave1/copilot-sales/)).

**Spec**
- Global command bar (⌘K) to query CRM: “show leads that need follow-up”, “summarize Acme thread”, “draft invoice email”.
- Outputs are suggestions; actions require confirmation.
- Uses model-router reasoning/drafting split.

**User stories**
- As a user, I can ask questions and get contextual answers.

**Wireframe (Command bar)**
```text
⌘K  Ask CRM...
--------------------------------
> "Show overdue follow-ups"

Results
  - Acme Inc. (3 days)
  - Bright Co (7 days)

[Open list] [Create tasks]
--------------------------------
```

**Acceptance criteria**
- Command bar answers in < 2s for simple queries.
- All actions show a confirmation step.

**Tech feasibility**: Medium.

**Effort**: 8–12 engineer-days.

---

### 8) P2 — Relationship-Aware Lead Scoring + Next Best Action
**Spec**
- Score leads based on engagement (inbox/calendar), enrichment, pipeline stage.
- Suggest next best action (email, call, proposal) with rationale.

**User stories**
- As a rep, I know what to do next to move deals forward.

**Wireframe (Lead list with NBA)**
```text
Leads
-------------------------------------------------
Acme Inc.     Score 92  Next: Follow-up email (draft ready)
Bright Co     Score 71  Next: Book call (2 slots suggested)
-------------------------------------------------
```

**Acceptance criteria**
- Scoring model is explainable (shows top 3 drivers).
- NBA suggestions are logged and measurable.

**Tech feasibility**: Medium.

**Effort**: 8–14 engineer-days.

## Roadmap (Timeline + Resources)

Assumption: 2 full-stack engineers + 1 product designer (0.5 FTE) + 1 PM (0.25 FTE).

### Phase 1 (Weeks 1–2): Secure foundations
- Feature 1 (Governance) + Feature 2 (Unify AI path)
- Deliverables:
  - Secrets never reach the browser
  - AI audit logs + cost caps
- Success metrics:
  - 0 direct provider calls from browser
  - AI cost variance within ±5% of estimate per provider
  - No P0 security findings in internal review

### Phase 2 (Weeks 3–5): Prospecting + inbox automation
- Feature 3 (Prospecting agent)
- Feature 5 (Inbound inbox)
- Success metrics:
  - 30–50 qualified prospects/week with evidence
  - Median “time to first reply” reduced by 20%

### Phase 3 (Weeks 6–9): Context enrichment
- Feature 4 (Email/calendar sync)
- Feature 8 (Scoring + NBA)
- Success metrics:
  - Manual data entry reduced by 50%
  - 15% increase in follow-up completion rate

### Phase 4 (Weeks 10–12): Deal closing loop
- Feature 6 (Proposal + e-sign + payments)
- Feature 7 (Command bar)
- Success metrics:
  - Proposal-to-close conversion +10%
  - Proposal cycle time -25%

## Integration Opportunities
- Research: Perplexity-like research endpoints for evidence-backed prospecting.
- Email: Mailgun/SendGrid inbound parse + outbound sending + tracking.
- Calendar: Google Calendar + Microsoft Graph.
- Payments: Stripe.
- E-sign: DocuSign/Dropbox Sign.
- Observability: Langfuse/Loki/Datadog fed by model-router structured events.

