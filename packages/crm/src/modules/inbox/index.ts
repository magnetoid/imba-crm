import { lazy } from 'react'
import { Inbox as InboxIcon } from 'lucide-react'
import type { CRMModule } from '../types'

const Inbox = lazy(() => import('./Inbox'))

export const module: CRMModule = {
  id: 'inbox',
  label: 'Inbox',
  icon: InboxIcon,
  group: 'outreach',
  order: 3,
  routes: [{ path: '', component: Inbox, index: true }],
}
