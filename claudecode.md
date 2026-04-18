# Project Rules — Agency AI CRM Model Router

These rules apply to every AI interaction in this project. Trae Builder Mode and Chat Mode should follow them by default.

## Project context
This is the model router for an agency-focused AI CRM. It is a standalone, decoupled library that will later be consumed by the Next.js app. The router's job is to take a task (reasoning, drafting, classification, extraction, embedding, research, voice, vision) and route it to the best available model based on policy, cost, latency, and fallback rules. Every call is logged for observability.

## Stack — use exactly these, reject alternatives
*   **Language**: TypeScript (strict mode)
*   **Runtime**: Node.js 20+ (must also run on Vercel Edge for hot paths)
*   **Package manager**: pnpm
*   **Test framework**: Vitest
*   **Build**: tsup (dual ESM + CJS output)
*   **Validation**: Zod
*   **HTTP client**: native fetch (no axios, no node-fetch)
*   **AI SDK base layer**: direct REST calls via fetch, NOT Vercel AI SDK, NOT LangChain, NOT LlamaIndex
*   **Logging**: pino (structured JSON)
*   **Lint/format**: Biome (not ESLint + Prettier)

## Reject on sight
If I ask you to use any of these, remind me I said no:
*   Prisma (we use Drizzle later in the app; router has no ORM)
*   LangChain, LlamaIndex, or any agent framework (we orchestrate in Dify separately)
*   Axios or node-fetch
*   Jest (Vitest only)
*   ESLint + Prettier (Biome)
*   Redis for caching in the router layer (keep it in-memory + hook, caller decides persistence)
*   Any model provider SDK that wraps fetch in a class — we go direct to REST for portability

## Architectural rules
*   **No I/O at import time.** No reading env vars, no opening connections, no logging. Everything lazy.
*   **Pure core, impure edges.** The routing decision is a pure function of (task, policy, available providers). Side effects (API calls, logging) are at the boundary.
*   **Provider adapter pattern.** Every model provider (Anthropic, OpenAI, Google, Ollama, Deepgram, Perplexity) gets an adapter implementing a common `ModelProvider` interface. Adding a provider = one new file, no changes to router.
*   **Fallback chains, not retries.** If a provider fails, route to the next in the chain. Don't retry the same provider more than once.
*   **Deterministic cost accounting.** Every response returns token counts + cost in cents. Pricing tables are versioned and dated.
*   **Observability is mandatory.** Every call emits an `AICallEvent` with task type, provider, model, tokens, latency, cost, success, error. The caller wires it to Langfuse or wherever.
*   **No hidden retries, no hidden prompting.** The router does not modify the user's prompt. What you send in is what goes to the model.
*   **Streaming and non-streaming are separate methods.** Don't overload one method.

## File structure — create exactly this
```text
packages/model-router/
├── src/
│   ├── index.ts                    # public API exports
│   ├── router.ts                   # the main route() and stream() functions
│   ├── policy.ts                   # policy resolution (task → provider chain)
│   ├── types.ts                    # all shared types (Task, Policy, Provider, Event)
│   ├── errors.ts                   # typed error classes
│   ├── cost.ts                     # pricing tables + cost calculation
│   ├── events.ts                   # AICallEvent emitter interface
│   ├── providers/
│   │   ├── base.ts                 # ModelProvider interface
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   ├── google.ts
│   │   ├── ollama.ts
│   │   ├── deepgram.ts
│   │   ├── perplexity.ts
│   │   └── index.ts                # provider registry
│   └── policies/
│       ├── default.ts              # default task→chain mappings
│       └── index.ts
├── tests/
│   ├── router.test.ts
│   ├── policy.test.ts
│   ├── cost.test.ts
│   └── providers/
│       └── *.test.ts               # one per provider, using mocked fetch
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── biome.json
└── README.md
```
No other files, no other directories, no generated docs folder.

## The Task taxonomy
```typescript
type TaskType =
  | 'reasoning'      // deep analysis, multi-step, high quality
  | 'drafting'       // emails, summaries, medium quality, fast
  | 'classification' // intent, priority, labels; fast + cheap
  | 'extraction'     // structured data from text; fast + cheap
  | 'embedding'      // semantic vectors
  | 'research'       // web-grounded research
  | 'voice'          // audio → text
  | 'vision'         // image → text / extraction
```
These are the only eight. Don't invent new ones.

## Provider defaults (do not change without asking)

| Task | Primary | Fallback 1 | Fallback 2 (local) |
|---|---|---|---|
| reasoning | Claude Opus 4.7 | GPT-5 | — |
| drafting | Claude Sonnet 4.6 | GPT-5-mini | Qwen 72B (Ollama) |
| classification | Claude Haiku 4.5 | Gemini Flash | Qwen 14B (Ollama) |
| extraction | Claude Haiku 4.5 | GPT-5-mini | Qwen 14B (Ollama) |
| embedding | OpenAI text-embedding-3-large | Voyage large | bge-large (Ollama) |
| research | Perplexity sonar-pro | — | — |
| voice | Deepgram nova-3 | — | Whisper (Ollama) |
| vision | Claude Sonnet 4.6 vision | GPT-5 vision | — |

Cost ceilings are per-agency and set in policy, not hardcoded here.

## Testing rules
*   **Unit tests mock fetch globally.** No real network calls in tests.
*   **Every provider adapter has a happy path, an error path, and a timeout path test.**
*   **Router tests cover:** primary succeeds; primary fails, fallback succeeds; all fail; cost cap hit; invalid task.
*   **Coverage target:** 90%+ on `src/`, don't chase 100%.
*   **No snapshot tests for AI outputs.** Test the routing decision, not the model's response content.

## Style
*   Use `type` not `interface` for data shapes (interfaces only for extension).
*   No default exports (named exports only, including the main `route` function).
*   No abbreviations: `provider` not `prov`, `classification` not `class`.
*   Errors extend a base `RouterError` with a `code` discriminator.
*   Comments explain *why*, not *what*. Code explains what.

## Anti-patterns to refuse
*   Singletons, global mutable state
*   Swallowed errors (every catch either handles or rethrows with context)
*   `any` (use `unknown` + narrowing; `any` allowed only at fetch boundary for response parsing)
*   `console.log` (use pino)
*   Hardcoded API keys in code or tests
*   "Utils" or "helpers" folders (put the function next to what uses it)

## What's explicitly out of scope for v1
*   Multi-provider parallel calls (call one, fall back)
*   Streaming for embeddings/voice/research
*   Retry logic beyond the fallback chain
*   Caching (caller's responsibility)
*   Rate limiting (caller's responsibility)
*   Persistence (caller's responsibility)
*   The Next.js app, the database schema, the UI
*   Build only the router. When done, I'll integrate it.

## When you're unsure
Ask me. Don't invent architecture. Don't add dependencies. Don't create files not in the structure above.
