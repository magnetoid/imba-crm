import type { ComponentType, LazyExoticComponent } from 'react'
import type { Role } from '@imba/shared/auth'

/**
 * A CRM feature module. Each module lives in its own folder under
 * `modules/<name>/` and exports a `module: CRMModule` object. Adding a new
 * feature is one folder: the sidebar, router, and permissions all pick it up
 * automatically via `modules/index.ts`.
 */
export interface CRMModule {
  /** Stable slug, used in URLs and React keys. */
  id: string
  /** Sidebar label. */
  label: string
  /** Lucide icon component (pass the icon itself, not JSX). */
  icon: ComponentType<{ className?: string }>
  /** Sidebar group — modules with the same `group` are rendered together.
   *  v2 groups (find / engage / close / intel) live alongside the legacy
   *  five so existing modules keep rendering without simultaneous edits. */
  group:
    | 'find'      // prospecting: lead-finder, site-analyzer
    | 'engage'    // outbound + inbound conversations: outreach, inbox, agents, chat-widget
    | 'close'     // monetisation: proposals, invoices
    | 'intel'     // visibility: analytics, audit, prompts
    // legacy groups kept for back-compat — phase out as modules migrate:
    | 'pipeline' | 'outreach' | 'deals' | 'intelligence' | 'leads'
  /** Sort order within the group (lower = higher). */
  order: number
  /** Route paths this module owns. First entry is the primary nav target. */
  routes: CRMRoute[]
  /** Optional role gate. If omitted, any authenticated user can access. */
  roles?: Role[]
  /** Hide from sidebar (but still routed) — useful for detail pages. */
  hidden?: boolean
}

export interface CRMRoute {
  path: string
  component: LazyExoticComponent<ComponentType> | ComponentType
  /** If true, this is the primary path (nav target). */
  index?: boolean
}
