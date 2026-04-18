# @agencycrm/model-router

Task-based AI model router with provider fallback chains and cost tracking.

## Install

```bash
pnpm add @agencycrm/model-router
```

## Usage

```ts
import { route, configure } from '@agencycrm/model-router'

// Option A: set ANTHROPIC_API_KEY in env
// Option B: configure explicitly
configure({
  providerConfigs: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
  },
})

const result = await route({
  type: 'drafting',
  messages: [{ role: 'user', content: 'Write a 2-sentence intro for a cold email.' }],
})

if (result.ok) {
  console.log(result.data.content)
  console.log('cost:', result.event.costCents, 'cents')
} else {
  console.error(result.error.code, result.error.message)
}
```

## Task types

`reasoning` · `drafting` · `classification` · `extraction` · `vision` · `embedding` · `voice` · `research`

Session 1 supports Anthropic for: reasoning, drafting, classification, extraction, vision. Other task types return `ALL_FALLBACKS_FAILED` until additional providers are added.

## Observability

```ts
import { configure, createEventEmitter } from '@agencycrm/model-router'

configure({
  emitter: createEventEmitter((event) => {
    console.log(event.taskType, event.provider, event.costCents)
  }),
})
```

## Adding a provider

1. Create `src/providers/yourprovider.ts` implementing the `ModelProvider` interface.
2. Register it in `src/providers/index.ts`.
3. Add chains to `src/policies/default.ts`.

```ts
import type { ModelProvider, ProviderConfig, ProviderResponse, TaskInput } from './types'

export function createYourProvider(): ModelProvider {
  return {
    name: 'yourprovider',
    async execute(task: TaskInput, config: ProviderConfig): Promise<ProviderResponse> {
      // call the provider API, return normalized response
    },
  }
}
```

## Build

```bash
pnpm build      # tsup → dist/
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm lint        # biome check
```
