import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Plus, Loader2, Globe, Sparkles, Trash2 } from 'lucide-react'

interface Translation {
  id: string
  locale: string
  namespace: string
  key: string
  value: string
}

interface EnRow { namespace: string; key: string; value: string }

const LOCALE_NAMES: Record<string, string> = {
  en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español',
  it: 'Italiano', pt: 'Português', nl: 'Nederlands', pl: 'Polski',
  ru: 'Русский', zh: '中文', ja: '日本語', ar: 'العربية',
}

export default function TranslationsAdmin() {
  const [locales, setLocales] = useState<string[]>(['en'])
  const [activeLocale, setActiveLocale] = useState('en')
  const [rows, setRows] = useState<Translation[]>([])
  const [enRows, setEnRows] = useState<EnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add language dialog
  const [addLangOpen, setAddLangOpen] = useState(false)
  const [newLocale, setNewLocale] = useState('')
  const [newLocaleName, setNewLocaleName] = useState('')

  // AI translate
  const [aiOpen, setAiOpen] = useState(false)
  const [aiKey, setAiKey] = useState(() => localStorage.getItem('anthropic_api_key') || '')
  const [aiLocale, setAiLocale] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiProgress, setAiProgress] = useState('')

  // Inline editing
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingCell, setSavingCell] = useState<string | null>(null)

  const loadLocales = useCallback(async () => {
    const { data } = await supabase.from('translations').select('locale')
    if (data?.length) {
      const unique = Array.from(new Set(data.map(r => r.locale)))
      setLocales(prev => Array.from(new Set(['en', ...prev, ...unique])))
    }
  }, [])

  const loadRows = useCallback(async (locale: string) => {
    setLoading(true)
    const [transRes, enRes] = await Promise.all([
      supabase.from('translations').select('*').eq('locale', locale).order('namespace').order('key'),
      supabase.from('translations').select('namespace, key, value').eq('locale', 'en').order('namespace').order('key'),
    ])
    setRows(transRes.data || [])
    setEnRows(enRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadLocales() }, [loadLocales])
  useEffect(() => { loadRows(activeLocale) }, [activeLocale, loadRows])

  async function saveCell(id: string | undefined, locale: string, namespace: string, key: string, value: string) {
    setSavingCell(key)
    if (id) {
      await supabase.from('translations').update({ value }).eq('id', id)
    } else {
      await supabase.from('translations').upsert([{ locale, namespace, key, value }], { onConflict: 'locale,namespace,key' })
    }
    setSavingCell(null)
    setEditingCell(null)
    loadRows(locale)
  }

  async function handleAddLanguage(e: React.FormEvent) {
    e.preventDefault()
    if (!newLocale.trim()) return
    const locale = newLocale.trim().toLowerCase().slice(0, 5)
    setLocales(prev => Array.from(new Set([...prev, locale])))
    setActiveLocale(locale)
    setAddLangOpen(false)
    setNewLocale('')
    setNewLocaleName('')
  }

  async function deleteLocale(locale: string) {
    if (locale === 'en') return
    if (!confirm(`Delete all translations for "${locale}"?`)) return
    await supabase.from('translations').delete().eq('locale', locale)
    setLocales(prev => prev.filter(l => l !== locale))
    if (activeLocale === locale) setActiveLocale('en')
    else loadRows(activeLocale)
  }

  async function handleAiTranslate() {
    if (!aiKey.trim()) { setAiError('Enter your Anthropic API key.'); return }
    const targetName = LOCALE_NAMES[aiLocale] || aiLocale
    setAiLoading(true)
    setAiError('')
    try {
      // Group English strings by namespace
      const byNs: Record<string, Record<string, string>> = {}
      for (const row of enRows) {
        if (!byNs[row.namespace]) byNs[row.namespace] = {}
        byNs[row.namespace][row.key] = row.value
      }
      const namespaces = Object.keys(byNs)
      const allTranslated: { namespace: string; key: string; value: string }[] = []

      for (let i = 0; i < namespaces.length; i++) {
        const ns = namespaces[i]
        setAiProgress(`Translating namespace "${ns}" (${i + 1}/${namespaces.length})…`)
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': aiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-allow-browser': 'true',
          },
          body: JSON.stringify({
            model: 'claude-opus-4-6',
            max_tokens: 2048,
            messages: [{
              role: 'user',
              content: `Translate these UI strings from English to ${targetName} (${aiLocale}). Return ONLY valid JSON with the same keys, values translated. Keep {{placeholder}} unchanged. Context: video production company website.\n\n${JSON.stringify(byNs[ns], null, 2)}`,
            }],
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error((err as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`)
        }
        const data = await res.json() as { content: Array<{ text: string }> }
        const text = data.content[0]?.text || '{}'
        const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/```\s*$/m, '').trim()
        const parsed = JSON.parse(cleaned) as Record<string, string>
        for (const [key, value] of Object.entries(parsed)) {
          allTranslated.push({ namespace: ns, key, value })
        }
      }

      setAiProgress(`Saving ${allTranslated.length} translations…`)
      const upsertData = allTranslated.map(t => ({ locale: aiLocale, ...t }))
      // Batch in chunks of 50
      for (let i = 0; i < upsertData.length; i += 50) {
        await supabase.from('translations').upsert(upsertData.slice(i, i + 50), { onConflict: 'locale,namespace,key' })
      }
      setAiOpen(false)
      loadRows(aiLocale)
      await loadLocales()
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Translation failed')
    } finally {
      setAiLoading(false)
      setAiProgress('')
    }
  }

  const filtered = rows.filter(r =>
    !search || r.key.toLowerCase().includes(search.toLowerCase()) || r.value.toLowerCase().includes(search.toLowerCase())
  )

  const getEnValue = (namespace: string, key: string) =>
    enRows.find(r => r.namespace === namespace && r.key === key)?.value || ''

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Translations</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage site translations by language</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { setAiLocale(activeLocale !== 'en' ? activeLocale : locales.find(l => l !== 'en') || ''); setAiError(''); setAiOpen(true) }}>
            <Sparkles className="h-4 w-4 mr-2" />AI Translate
          </Button>
          <Button onClick={() => setAddLangOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Add language
          </Button>
        </div>
      </div>

      {/* Language tabs */}
      <div className="flex gap-1 flex-wrap mb-6 border-b border-border pb-1">
        {locales.map(locale => (
          <div key={locale} className="flex items-center gap-1">
            <button
              onClick={() => setActiveLocale(locale)}
              className={`px-4 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 ${
                activeLocale === locale
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {LOCALE_NAMES[locale] || locale.toUpperCase()}
              <span className="ml-1 opacity-50 font-mono text-[0.6rem]">({locale})</span>
            </button>
            {locale !== 'en' && (
              <button
                onClick={() => deleteLocale(locale)}
                className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 rounded"
                title="Delete this language"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by key or value…"
          className="max-w-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 && activeLocale !== 'en' ? (
        <div className="flex flex-col items-center justify-center py-16 border border-border rounded-lg">
          <Globe className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">No translations for {LOCALE_NAMES[activeLocale] || activeLocale} yet</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Use "AI Translate" to auto-generate from English</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Namespace</TableHead>
              <TableHead className="w-48">Key</TableHead>
              {activeLocale !== 'en' && <TableHead>English</TableHead>}
              <TableHead>Translation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(row => {
              const cellId = `${row.namespace}-${row.key}`
              const isEditing = editingCell === cellId
              return (
                <TableRow key={row.id}>
                  <TableCell><Badge variant="secondary" className="text-xs font-mono">{row.namespace}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{row.key}</TableCell>
                  {activeLocale !== 'en' && (
                    <TableCell className="text-sm text-muted-foreground/60 max-w-[200px]">
                      {getEnValue(row.namespace, row.key)}
                    </TableCell>
                  )}
                  <TableCell>
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <Input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveCell(row.id, row.locale, row.namespace, row.key, editValue)
                            if (e.key === 'Escape') setEditingCell(null)
                          }}
                          className="h-7 text-sm py-1"
                        />
                        <Button size="sm" className="h-7 px-2 text-xs" disabled={savingCell === row.key}
                          onClick={() => saveCell(row.id, row.locale, row.namespace, row.key, editValue)}>
                          {savingCell === row.key ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingCell(null)}>✕</Button>
                      </div>
                    ) : (
                      <button
                        className="text-sm text-foreground text-left w-full hover:text-primary transition-colors"
                        onClick={() => { setEditingCell(cellId); setEditValue(row.value) }}
                        title="Click to edit"
                      >
                        {row.value || <span className="text-muted-foreground italic">empty</span>}
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* Add language dialog */}
      <Dialog open={addLangOpen} onOpenChange={setAddLangOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add language</DialogTitle></DialogHeader>
          <form onSubmit={handleAddLanguage} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Locale code</Label>
              <Input value={newLocale} onChange={e => setNewLocale(e.target.value)} placeholder="e.g. de, fr, es, zh" />
              <p className="text-xs text-muted-foreground">2-letter ISO 639-1 code</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Language name</Label>
              <Input value={newLocaleName} onChange={e => setNewLocaleName(e.target.value)} placeholder="e.g. German, French" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddLangOpen(false)}>Cancel</Button>
              <Button type="submit">Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* AI translate dialog */}
      <Dialog open={aiOpen} onOpenChange={o => { setAiOpen(o); if (!o) { setAiError(''); setAiProgress('') } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />AI Auto-translate
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Translates all English strings into the target language using Claude. Existing translations will be overwritten.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>Target language</Label>
              <div className="flex gap-2 flex-wrap">
                {locales.filter(l => l !== 'en').map(l => (
                  <button key={l} onClick={() => setAiLocale(l)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      aiLocale === l ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
                    }`}>
                    {LOCALE_NAMES[l] || l}
                  </button>
                ))}
                {locales.filter(l => l !== 'en').length === 0 && (
                  <p className="text-xs text-muted-foreground">Add a language first using "Add language".</p>
                )}
              </div>
            </div>
            <Separator />
            <div className="flex flex-col gap-1.5">
              <Label>Anthropic API key</Label>
              <Input type="password" value={aiKey} onChange={e => setAiKey(e.target.value)} placeholder="sk-ant-…" />
              <p className="text-xs text-muted-foreground">Stored locally in your browser.</p>
            </div>
            {aiProgress && <p className="text-xs text-muted-foreground animate-pulse">{aiProgress}</p>}
            {aiError && <p className="text-destructive text-sm">{aiError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAiOpen(false)}>Cancel</Button>
            <Button onClick={handleAiTranslate} disabled={aiLoading || !aiLocale}>
              {aiLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Translating…</> : <><Sparkles className="mr-2 h-4 w-4" />Translate</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
