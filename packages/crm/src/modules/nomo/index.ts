import { lazy } from 'react'
import { Sparkles } from 'lucide-react'
import type { CRMModule } from '../types'

const Nomo = lazy(() => import('./Nomo'))

export const module: CRMModule = {
  id: 'nomo',
  label: 'Nomo',
  icon: Sparkles,
  group: 'intel',
  order: 1,
  routes: [
    { path: '',          component: Nomo, index: true },
    { path: ':threadId', component: Nomo },
  ],
}
