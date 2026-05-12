import { lazy } from 'react'
import { History } from 'lucide-react'
import type { CRMModule } from '../types'

const Audit = lazy(() => import('./Audit'))

export const module: CRMModule = {
  id: 'audit',
  label: 'AI Audit',
  icon: History,
  group: 'intel',
  order: 2,
  hidden: true,                  // merged conceptually with Agents — reach via Cmd+K
  routes: [{ path: '', component: Audit, index: true }],
}
