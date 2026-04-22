import { lazy } from 'react'
import { Send } from 'lucide-react'
import type { CRMModule } from '../types'

const Outreach = lazy(() => import('./Outreach'))

export const module: CRMModule = {
  id: 'outreach',
  label: 'Outreach',
  icon: Send,
  group: 'outreach',
  order: 2,
  routes: [{ path: '', component: Outreach, index: true }],
}
