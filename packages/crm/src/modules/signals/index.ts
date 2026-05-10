import { lazy } from 'react'
import { Radio } from 'lucide-react'
import type { CRMModule } from '../types'

const Signals = lazy(() => import('./Signals'))

export const module: CRMModule = {
  id: 'signals',
  label: 'Signals',
  icon: Radio,
  group: 'find',
  order: 3,
  routes: [
    { path: '', component: Signals, index: true },
  ],
}
