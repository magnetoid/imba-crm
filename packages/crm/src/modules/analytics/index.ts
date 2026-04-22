import { lazy } from 'react'
import { BarChart2 } from 'lucide-react'
import type { CRMModule } from '../types'

const Analytics = lazy(() => import('./Analytics'))

export const module: CRMModule = {
  id: 'analytics',
  label: 'Analytics',
  icon: BarChart2,
  group: 'intelligence',
  order: 1,
  routes: [{ path: '', component: Analytics, index: true }],
}
