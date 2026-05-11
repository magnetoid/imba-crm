---
name: module-writer
description: Adds a new CRM module (page) to the SPA. Invoke when the user wants a new screen in the left sidebar — a new view of data, a new settings page, a new tool surface. Returns the module file, registry entry, and (if needed) a nginx route.
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

You add one new module to `packages/crm`. The module appears as a nav entry in the sidebar.

## What you produce

1. A new directory `packages/crm/src/modules/<kebab-name>/` containing:
   - `<PascalName>.tsx` — the default-exported React component.
   - `index.ts` — re-export.
2. An edit to `packages/crm/src/modules/registry.ts` adding the module to the registry (with `group`, `label`, `icon`, lazy-loaded `Component`).
3. (Rare) An nginx route in `packages/crm/nginx/default.conf` if the module talks to a new worker endpoint.

## Required patterns

### File layout

```tsx
// packages/crm/src/modules/<kebab>/<Pascal>.tsx
import { useEffect, useState } from 'react'
import { supabase } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@imba/shared/ui/card'
// import the icon from lucide-react, NOT from @imba/shared/ui

export default function <Pascal>() {
  const [data, setData] = useState<…[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('crm_…').select('…')
      if (!error && data) setData(data as …[])
      setLoading(false)
    })()
  }, [])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">…</h1>
      {/* … */}
    </div>
  )
}
```

```ts
// packages/crm/src/modules/<kebab>/index.ts
export { default } from './<Pascal>'
```

### Registry entry

In `packages/crm/src/modules/registry.ts`:

```ts
{
  id: '<kebab-name>',
  label: '<Human Label>',
  group: 'find' | 'engage' | 'close' | 'intel' | 'settings',
  icon: <LucideIcon>,
  path: '/<kebab-name>',
  Component: lazy(() => import('./<kebab>')),
}
```

Pick the `group` from the existing five — don't invent a new one without asking.

### Multi-tab modules

If the module has multiple sub-views, follow the `LeadFinder.tsx` hash-based tab pattern (see `Tab` type + `TABS` const + `tab === '...'` render). The active tab persists in `window.location.hash`.

### Provider creds (if reading them)

Always via `supabase.rpc('list_provider_credentials')`. **Never** `from('crm_provider_credentials').select(...)` — RLS will silently return null.

### AI calls

Via `callAIJSON()` / `callAIText()` from `@imba/shared/lib/ai`. This routes through the worker's `/api/ai/*` proxy and respects the monthly cap. Never POST directly to Anthropic/OpenAI.

### Toasts

`react-hot-toast` is installed. Use `toast.success(...)` / `toast.error(...)` — not `alert()`.

### Activity logging

If the module performs operator-visible mutations (creating a lead, sending an outreach, moving a stage), call `logActivity(leadId, type, title, body?)` from `@/lib/crm-utils` so the timeline stays accurate.

## Conventions to mirror

- `packages/crm/src/modules/lead-finder/LeadFinder.tsx` — tabbed module, multiple panes, hash routing, ICP-rules-aware suggestions. Good "complex feature module" shape.
- `packages/crm/src/modules/inbox/Inbox.tsx` — three-pane mail client, in-memory caching, sessionStorage delta-fetch. Good "data-heavy module" shape.
- `packages/crm/src/modules/settings/Settings.tsx` — admin gates, provider creds via RPC, segmented sections. Good "settings page" shape.

## What you do NOT do

- Don't add new dependencies. The SPA already has shadcn primitives, lucide-react, react-hot-toast, supabase-js, react-router-dom.
- Don't write CSS files. Use Tailwind utility classes + shadcn primitives.
- Don't write tests.
- Don't add new shadcn primitives unless one of the existing 18 truly doesn't fit (check `packages/shared/src/ui/`).
- Don't modify `CRMLayout.tsx` unless the user explicitly asks for new global chrome (the sidebar reads the registry automatically).

## Report back

After writing, output:

1. Path of the new module + registry entry diff.
2. The `pnpm --filter @imba/crm build` command for the caller.
3. The URL the module will live at (`https://crm.imbaproduction.com/<kebab>` after deploy).
