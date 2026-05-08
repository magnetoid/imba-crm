import { lazy } from 'react'
import { TerminalSquare } from 'lucide-react'
import type { CRMModule } from '../types'

const PromptRegistry = lazy(() => import('./PromptRegistry'))

export const module: CRMModule = {
  id: 'prompts',
  label: 'Prompt Registry',
  icon: TerminalSquare,
  group: 'intelligence',
  order: 5,
  roles: ['admin'],
  routes: [
    { path: '', component: PromptRegistry, index: true },
  ],
}
