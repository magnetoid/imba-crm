# System Analysis & Improvement Roadmap

## 1. Executive Summary
An in-depth review of the `model-router` library in the `imba-crm` project reveals that while the core architecture and testing framework (Vitest, Biome) align with the project rules in `claudecode.md`, the implementation is significantly incomplete. It currently acts as a skeletal prototype with only the Anthropic provider implemented.

## 2. Findings & Evidence

### 2.1 Architecture & Feature Completeness
**Issue:** Missing critical providers and the `stream()` interface.
*   **Evidence:** `src/providers/` only contains `anthropic.ts`. `openai.ts`, `google.ts`, `ollama.ts`, `deepgram.ts`, and `perplexity.ts` are entirely missing.
*   **Evidence:** `src/router.ts` only exports the `route()` function, completely omitting the `stream()` function required by the architecture rules.
*   **Impact:** The system cannot fulfill its primary goal of routing to various models or streaming responses.

### 2.2 Code Quality & Type Safety
**Issue:** Implicit `any` boundaries and unsafe response parsing.
*   **Evidence:** In `anthropic.ts`, `await response.json()` is assigned to an implicitly `any` variable (`data`). It then relies on optional chaining (`data.content?.filter...`) without runtime schema validation.
*   **Impact:** If the provider API changes or returns unexpected JSON shapes (e.g., HTML error pages masquerading as 200 OK), the router will throw obscure TypeError exceptions instead of structured `RouterError`s.

### 2.3 Configuration & Policy
**Issue:** Incomplete policies and missing cost accounting.
*   **Evidence:** `src/policies/default.ts` only lists Anthropic models and leaves `embedding`, `voice`, and `research` as empty arrays.
*   **Evidence:** `src/cost.ts` only contains pricing for Anthropic models.
*   **Impact:** The fallback chain and deterministic cost accounting will fail for non-Anthropic tasks.

### 2.4 Testing & Maintainability
**Issue:** Uncovered edge cases and missing provider tests.
*   **Evidence:** Test coverage report shows `src/providers/anthropic.ts` at 85.82%, missing lines 46-57 (multimodal image block parsing) and `src/router.ts` missing lines 36-45 (environment variable fallback for API keys).
*   **Impact:** Unverified code paths might crash in production, particularly for vision tasks.

## 3. Improvement Roadmap

| Priority | Area | Action | Effort | Success Metric |
| :--- | :--- | :--- | :--- | :--- |
| **High** | Feature Completeness | Implement `openai`, `google`, `ollama`, `deepgram`, and `perplexity` providers. | High | All 6 providers pass mocked unit tests. |
| **High** | Feature Completeness | Add `stream()` method to `router.ts` (for supported tasks). | Medium | `stream()` yields chunks and fires events properly. |
| **High** | Configuration | Update `cost.ts` and `default.ts` with complete taxonomy mappings. | Low | 100% coverage of the taxonomy table in `claudecode.md`. |
| **Medium** | Code Quality | Replace `any` fetch parsing with strict `Zod` schemas for all provider responses. | Medium | Zero implicit `any` usage at network boundaries. |
| **Medium** | Testing | Add tests for `router.ts` env var fallback and Anthropic vision/multimodal blocks. | Low | >95% test coverage across `src/`. |

## 4. Next Steps (Immediate Implementation)
To achieve full functionality per the `claudecode.md` specifications, the following tasks will be implemented immediately:
1.  **Add OpenAI Provider:** Complete with tests, mapping models, and updating `cost.ts`.
2.  **Add Google & Ollama Providers:** To support fallbacks for drafting and classification.
3.  **Update Default Policy:** Fulfilling the `default.ts` provider fallback matrix.
4.  **Implement `stream()`:** Updating `router.ts` to support streaming endpoints.