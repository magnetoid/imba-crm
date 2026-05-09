import { lazy } from 'react'
import { Search } from 'lucide-react'
import type { CRMModule } from '../types'

const SEOManager = lazy(() => import('./SEOManager'))

export const module: CRMModule = {
  id: 'seo',
  label: 'SEO Studio',
  icon: Search,
  group: 'intel',
  order: 4,
  routes: [{ path: '', component: SEOManager, index: true }],
}
