import { lazy } from 'react'
import { FileText } from 'lucide-react'
import type { CRMModule } from '../types'

const Proposals = lazy(() => import('./Proposals'))

export const module: CRMModule = {
  id: 'proposals',
  label: 'Proposals',
  icon: FileText,
  group: 'deals',
  order: 1,
  routes: [{ path: '', component: Proposals, index: true }],
}
