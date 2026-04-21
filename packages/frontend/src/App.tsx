import { Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import '@/i18n'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import QuoteModal from '@/components/QuoteModal'
import { QuoteModalProvider } from '@/contexts/QuoteModalContext'
import Home from '@/pages/Home'
import Work from '@/pages/Work'
import Services from '@/pages/Services'
import About from '@/pages/About'
import Blog from '@/pages/Blog'
import BlogPost from '@/pages/BlogPost'
import Contact from '@/pages/Contact'
import Reviews from '@/pages/Reviews'
import ServicePage from '@/pages/services/ServicePage'
import AdminLayout from '@/admin/AdminLayout'
import AdminLanding from '@/admin/AdminLanding'
import Dashboard from '@/admin/Dashboard'
import HeroVideosAdmin from '@/admin/HeroVideosAdmin'
import PortfolioAdmin from '@/admin/PortfolioAdmin'
import BlogAdmin from '@/admin/BlogAdmin'
import QuoteRequests from '@/admin/QuoteRequests'
import MediaAdmin from '@/admin/MediaAdmin'
import BlogCategoriesAdmin from '@/admin/BlogCategoriesAdmin'
import ImportAdmin from '@/admin/ImportAdmin'
import TranslationsAdmin from '@/admin/TranslationsAdmin'
import TestimonialsAdmin from '@/admin/TestimonialsAdmin'
import CRMDashboard from '@/admin/crm/CRMDashboard'
import LeadDetail from '@/admin/crm/LeadDetail'
import SEOManager from '@/admin/crm/SEOManager'
import AILeadSearcher from '@/admin/crm/AILeadSearcher'
import AIOutreach from '@/admin/crm/AIOutreach'
import AIInbox from '@/admin/crm/AIInbox'
import AIAnalytics from '@/admin/crm/AIAnalytics'
import AISettings from '@/admin/crm/AISettings'
import Proposals from '@/admin/crm/Proposals'
import Invoices from '@/admin/crm/Invoices'
import Templates from '@/admin/crm/Templates'

// Scroll reveal observer
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1 }
    )
    const els = document.querySelectorAll('.reveal')
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  })
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  useScrollReveal()
  return (
    <>
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <div className="scan-line" />
      <Nav />
      <main id="main-content">{children}</main>
      <Footer />
    </>
  )
}

export default function App() {
  return (
    <QuoteModalProvider>
      <QuoteModal />
      <Routes>
        {/* Public */}
        <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
        <Route path="/work" element={<PublicLayout><Work /></PublicLayout>} />
        <Route path="/services" element={<PublicLayout><Services /></PublicLayout>} />
        <Route path="/services/:slug" element={<PublicLayout><ServicePage /></PublicLayout>} />
        <Route path="/about" element={<PublicLayout><About /></PublicLayout>} />
        <Route path="/blog" element={<PublicLayout><Blog /></PublicLayout>} />
        <Route path="/blog/:slug" element={<PublicLayout><BlogPost /></PublicLayout>} />
        <Route path="/contact" element={<PublicLayout><Contact /></PublicLayout>} />
<Route path="/reviews" element={<PublicLayout><Reviews /></PublicLayout>} />

        {/* Admin */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminLanding />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="hero-videos" element={<HeroVideosAdmin />} />
          <Route path="portfolio" element={<PortfolioAdmin />} />
          <Route path="blog" element={<BlogAdmin />} />
          <Route path="blog/categories" element={<BlogCategoriesAdmin />} />
          <Route path="media" element={<MediaAdmin />} />
          <Route path="import" element={<ImportAdmin />} />
          <Route path="quotes" element={<QuoteRequests />} />
          <Route path="seo" element={<SEOManager />} />
          <Route path="translations" element={<TranslationsAdmin />} />
          <Route path="testimonials" element={<TestimonialsAdmin />} />
          <Route path="crm" element={<CRMDashboard />} />
          <Route path="crm/ai-search" element={<AILeadSearcher />} />
          <Route path="crm/outreach" element={<AIOutreach />} />
          <Route path="crm/inbox" element={<AIInbox />} />
          <Route path="crm/proposals" element={<Proposals />} />
          <Route path="crm/invoices" element={<Invoices />} />
          <Route path="crm/templates" element={<Templates />} />
          <Route path="crm/analytics" element={<AIAnalytics />} />
          <Route path="crm/settings" element={<AISettings />} />
          <Route path="crm/:id" element={<LeadDetail />} />
        </Route>
      </Routes>
    </QuoteModalProvider>
  )
}
