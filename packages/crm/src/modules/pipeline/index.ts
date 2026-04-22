import { lazy } from 'react'
import { Users } from 'lucide-react'
import type { CRMModule } from '../types'

const Pipeline = lazy(() => import('./Pipeline'))
const LeadDetail = lazy(() => import('./LeadDetail'))

export const module: CRMModule = {
  id: 'pipeline',
  label: 'Pipeline',
  icon: Users,
  group: 'pipeline',
  order: 1,
  routes: [
    { path: '', component: Pipeline, index: true },
    { path: ':id', component: LeadDetail },
  ],
}
