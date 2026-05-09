import { lazy } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import type { CRMModule } from '../types'

const Settings = lazy(() => import('./Settings'))

export const module: CRMModule = {
  id: 'settings',
  label: 'Settings',
  icon: SettingsIcon,
  group: 'intel',
  order: 3,
  roles: ['admin'],
  routes: [{ path: '', component: Settings, index: true }],
}
