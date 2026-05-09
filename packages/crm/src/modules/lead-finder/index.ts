import { lazy } from 'react'
import { Search } from 'lucide-react'
import type { CRMModule } from '../types'

const LeadFinder = lazy(() => import('./LeadFinder'))

export const module: CRMModule = {
  id: 'lead-finder',
  label: 'Lead Finder',
  icon: Search,
  group: 'find',
  order: 1,
  routes: [{ path: '', component: LeadFinder, index: true }],
}
