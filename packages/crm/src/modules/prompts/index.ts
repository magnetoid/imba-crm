import { lazy } from 'react'
import { TerminalSquare } from 'lucide-react'
import type { CRMModule } from '../types'

const PromptRegistry = lazy(() => import('./PromptRegistry'))

export const module: CRMModule = {
  id: 'prompts',
  label: 'Prompt Registry',
  icon: TerminalSquare,
  group: 'intel',
  order: 5,
  roles: ['admin'],
  hidden: true,                  // power-user — reach via Cmd+K
  routes: [
    { path: '', component: PromptRegistry, index: true },
  ],
}
