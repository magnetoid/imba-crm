import { lazy } from 'react'
import { Bot } from 'lucide-react'
import type { CRMModule } from '../types'

const Agents      = lazy(() => import('./Agents'))
const AgentDetail = lazy(() => import('./AgentDetail'))

export const module: CRMModule = {
  id: 'agents',
  label: 'Agents',
  icon: Bot,
  group: 'engage',
  order: 4,
  routes: [
    { path: '',     component: Agents,      index: true },
    { path: ':id',  component: AgentDetail },
  ],
}
