import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

interface LangOption {
  locale: string
  label: string
}

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  ru: 'Русский',
  zh: '中文',
  ja: '日本語',
  ar: 'العربية',
}

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [langs, setLangs] = useState<LangOption[]>([{ locale: 'en', label: 'English' }])
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const currentLocale = i18n.language?.slice(0, 2) || 'en'

  // Load available locales from DB
  useEffect(() => {
    supabase
      .from('translations')
      .select('locale')
      .then(({ data }) => {
        if (!data?.length) return
        const unique = ['en', ...Array.from(new Set(data.map(r => r.locale))).filter(l => l !== 'en')]
        setLangs(unique.map(locale => ({
          locale,
          label: LOCALE_NAMES[locale] ?? locale.toUpperCase(),
        })))
      })
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function switchLanguage(locale: string) {
    if (locale === currentLocale) { setOpen(false); return }
    setSwitching(true)
    setOpen(false)
    try {
      // Fetch translations for this locale from Supabase
      const { data } = await supabase
        .from('translations')
        .select('namespace, key, value')
        .eq('locale', locale)

      if (data?.length) {
        // Group by namespace
        const byNs: Record<string, Record<string, string>> = {}
        for (const row of data) {
          if (!byNs[row.namespace]) byNs[row.namespace] = {}
          byNs[row.namespace][row.key] = row.value
        }
        // Register all namespaces
        for (const [ns, resources] of Object.entries(byNs)) {
          if (!i18n.hasResourceBundle(locale, ns)) {
            i18n.addResourceBundle(locale, ns, resources, true, true)
          }
        }
      }

      await i18n.changeLanguage(locale)
    } finally {
      setSwitching(false)
    }
  }

  // Only show if more than one language available
  if (langs.length <= 1) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={switching}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          background: 'transparent',
          border: '1px solid rgba(245,244,240,0.12)',
          borderRadius: '3px',
          color: switching ? 'rgba(245,244,240,0.3)' : 'rgba(245,244,240,0.5)',
          fontFamily: 'DM Mono, monospace',
          fontSize: '0.6rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          cursor: switching ? 'wait' : 'pointer',
          transition: 'color 0.2s, border-color 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#F5F4F0'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,244,240,0.3)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(245,244,240,0.5)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,244,240,0.12)' }}
        aria-label="Switch language"
      >
        {currentLocale.toUpperCase()}
        <span style={{ opacity: 0.5, fontSize: '0.5rem' }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          minWidth: '140px',
          background: '#111113',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '4px',
          overflow: 'hidden',
          zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          {langs.map(({ locale, label }) => (
            <button
              key={locale}
              onClick={() => switchLanguage(locale)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '8px 12px',
                background: locale === currentLocale ? 'rgba(232,69,42,0.08)' : 'transparent',
                color: locale === currentLocale ? '#E8452A' : 'rgba(245,244,240,0.7)',
                fontFamily: 'DM Mono, monospace',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { if (locale !== currentLocale) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#F5F4F0' }}}
              onMouseLeave={e => { if (locale !== currentLocale) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(245,244,240,0.7)' }}}
            >
              <span>{label}</span>
              <span style={{ opacity: 0.4, fontSize: '0.55rem' }}>{locale.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
