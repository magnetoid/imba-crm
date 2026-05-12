import { lazy } from 'react'
import { Radar } from 'lucide-react'
import type { CRMModule } from '../types'

const SiteAnalyzer = lazy(() => import('./SiteAnalyzer'))
const AnalysisReport = lazy(() => import('./AnalysisReport'))

export const module: CRMModule = {
  id: 'site-analyzer',
  label: 'Site Analyzer',
  icon: Radar,
  group: 'find',
  order: 2,
  hidden: true,                  // opened from LeadDetail "Analyze site" button
  routes: [
    { path: '', component: SiteAnalyzer, index: true },
    { path: ':id', component: AnalysisReport },
  ],
}
