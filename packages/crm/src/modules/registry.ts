import type { CRMModule } from './types'

import { module as pipeline } from './pipeline'
import { module as leadFinder } from './lead-finder'
import { module as outreach } from './outreach'
import { module as inbox } from './inbox'
import { module as proposals } from './proposals'
import { module as invoices } from './invoices'
import { module as templates } from './templates'
import { module as analytics } from './analytics'
import { module as audit } from './audit'
import { module as settings } from './settings'
import { module as seo } from './seo'
import { module as prompts } from './prompts'
import { module as siteAnalyzer } from './site-analyzer'

/**
 * Registered CRM modules. Adding a new feature is:
 *   1. create `modules/<name>/index.ts` that exports `module: CRMModule`
 *   2. import and append it here.
 *
 * Keep the pipeline module first — it's the default landing area.
 */
export const MODULES: CRMModule[] = [
  pipeline,
  leadFinder,
  outreach,
  inbox,
  proposals,
  invoices,
  templates,
  analytics,
  audit,
  prompts,
  siteAnalyzer,
  settings,
  seo,
]

export const GROUPS: { id: CRMModule['group']; label: string }[] = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'find',     label: 'Find' },
  { id: 'engage',   label: 'Engage' },
  { id: 'close',    label: 'Close' },
  { id: 'intel',    label: 'Intelligence' },
]

export function modulesByGroup(group: CRMModule['group']): CRMModule[] {
  return MODULES.filter(m => m.group === group && !m.hidden).sort((a, b) => a.order - b.order)
}

export function primaryPath(m: CRMModule): string {
  const primary = m.routes.find(r => r.index) ?? m.routes[0]
  return `/${m.id}${primary?.path ? `/${primary.path}` : ''}`.replace(/\/$/, '') || `/${m.id}`
}
