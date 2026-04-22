import { lazy } from 'react'
import { FileCode } from 'lucide-react'
import type { CRMModule } from '../types'

const Templates = lazy(() => import('./Templates'))

export const module: CRMModule = {
  id: 'templates',
  label: 'Templates',
  icon: FileCode,
  group: 'deals',
  order: 3,
  routes: [{ path: '', component: Templates, index: true }],
}
