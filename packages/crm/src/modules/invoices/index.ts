import { lazy } from 'react'
import { Receipt } from 'lucide-react'
import type { CRMModule } from '../types'

const Invoices = lazy(() => import('./Invoices'))

export const module: CRMModule = {
  id: 'invoices',
  label: 'Invoices',
  icon: Receipt,
  group: 'close',
  order: 2,
  routes: [{ path: '', component: Invoices, index: true }],
}
