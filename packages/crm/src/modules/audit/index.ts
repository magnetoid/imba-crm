import { lazy } from 'react'
import { History } from 'lucide-react'
import type { CRMModule } from '../types'

const Audit = lazy(() => import('./Audit'))

export const module: CRMModule = {
  id: 'audit',
  label: 'AI Audit',
  icon: History,
  group: 'intelligence',
  order: 2,
  routes: [{ path: '', component: Audit, index: true }],
}
