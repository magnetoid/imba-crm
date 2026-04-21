import { Link } from 'react-router-dom'
import { useQuoteModal } from '@/contexts/QuoteModalContext'

const SERVICES = ['Brand Video', 'AI Video', 'Product Video', 'Social Video', 'Post Production', 'Drone & Aerial', 'eLearning']
const COMPANY = [
  { label: 'About Us', to: '/about' },
  { label: 'Our Work', to: '/work' },
  { label: 'Reviews', to: '/reviews' },
  { label: 'Blog', to: '/blog' },
  { label: 'Contact', to: '/contact' },
  { label: 'Careers', to: '/about' },
]
const SOCIAL = [
  { label: 'IG', href: 'https://instagram.com/imbaproduction' },
  { label: 'YT', href: 'https://youtube.com/channel/UCV4zBHquBoo4NLw0tMi2ZKQ' },
  { label: 'TK', href: 'https://tiktok.com/@imbaproduction' },
  { label: 'LI', href: 'https://linkedin.com/company/imba-production' },
  { label: 'X',  href: 'https://twitter.com/productionimba' },
  { label: 'FV', href: 'https://fiverr.com/imbaproduction' },
]

export default function Footer() {
  const { openModal } = useQuoteModal()
  return (
    <footer className="bg-ink-3 border-t border-white/5">
      {/* Top strip */}
      <div className="border-b border-white/5 px-6 lg:px-12 py-6 flex items-center justify-between">
        <p className="font-mono-custom text-[0.6rem] tracking-[0.2em] text-smoke-faint uppercase">
          Ready to outperform your last campaign?
        </p>
        <button onClick={() => openModal()} className="btn btn-primary text-[0.65rem]">
          Get a free quote →
        </button>
      </div>

      {/* Main footer */}
      <div className="px-6 lg:px-12 py-16 grid grid-cols-1 md:grid-cols-4 gap-12">
        {/* Brand */}
        <div className="md:col-span-1">
          <div className="font-display font-light text-2xl text-smoke mb-4">
            imba<span className="text-ember italic">.</span>production
          </div>
          <p className="text-sm text-smoke-dim leading-relaxed max-w-xs mb-6">
            Video production that drives revenue, not just views. Cinematic craft, AI-speed delivery, built around your business goals.
          </p>
          <div className="flex gap-2">
            {SOCIAL.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 border border-white/10 flex items-center justify-center font-mono-custom text-[0.6rem] text-smoke-dim hover:border-ember hover:text-ember transition-all"
              >
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* Services */}
        <div>
          <p className="font-mono-custom text-[0.6rem] tracking-[0.18em] uppercase text-smoke mb-5">Services</p>
          <ul className="flex flex-col gap-3">
            {SERVICES.map(s => (
              <li key={s}>
                <Link to="/services" className="text-sm text-smoke-dim hover:text-smoke transition-colors">
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Company */}
        <div>
          <p className="font-mono-custom text-[0.6rem] tracking-[0.18em] uppercase text-smoke mb-5">Company</p>
          <ul className="flex flex-col gap-3">
            {COMPANY.map(({ label, to }) => (
              <li key={label}>
                <Link to={to} className="text-sm text-smoke-dim hover:text-smoke transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Contact */}
        <div>
          <p className="font-mono-custom text-[0.6rem] tracking-[0.18em] uppercase text-smoke mb-5">Contact</p>
          <div className="flex flex-col gap-3 text-sm text-smoke-dim">
            <a href="mailto:hello@imbaproduction.com" className="hover:text-ember transition-colors">
              hello@imbaproduction.com
            </a>
            <p className="leading-relaxed">
              007 N Orange St, 4th Floor<br />
              Suite #3601<br />
              Wilmington, Delaware 19801<br />
              United States
            </p>
            <a
              href="https://upwork.com/o/companies/~019264e73ffa6c4d29/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-smoke transition-colors"
            >
              Upwork profile →
            </a>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-white/5 px-6 lg:px-12 py-5 flex flex-col md:flex-row items-center justify-between gap-3">
        <p className="font-mono-custom text-[0.6rem] tracking-[0.1em] text-smoke-faint/50">
          © {new Date().getFullYear()} Imba Production LLC. All rights reserved.
        </p>
        <div className="flex gap-6">
          <Link to="/privacy" className="font-mono-custom text-[0.6rem] text-smoke-faint/50 hover:text-smoke-dim transition-colors">
            Privacy Policy
          </Link>
          <Link to="/admin" className="font-mono-custom text-[0.6rem] text-smoke-faint/30 hover:text-smoke-dim transition-colors">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  )
}
