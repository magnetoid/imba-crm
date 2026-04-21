import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react'

interface SeoPage {
  id: string
  path: string
  title?: string
  description?: string
  og_title?: string
  og_description?: string
  og_image?: string
  canonical?: string
  noindex: boolean
  structured_data?: object
  created_at: string
}

const KNOWN_PATHS = [
  '/', '/work', '/services', '/services/brand-video', '/services/ai-video',
  '/services/product-video', '/services/social-video', '/services/cooking-video',
  '/services/post-production', '/services/elearning-video', '/services/fashion-video',
  '/services/testimonial-video', '/blog', '/about', '/contact',
]

const EMPTY: Omit<SeoPage, 'id' | 'created_at'> = {
  path: '', title: '', description: '', og_title: '', og_description: '',
  og_image: '', canonical: '', noindex: false, structured_data: undefined,
}

export default function SeoAdmin() {
  const [rows, setRows] = useState<SeoPage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [jsonError, setJsonError] = useState('')
  const [structuredRaw, setStructuredRaw] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('seo_pages').select('*').order('path')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY)
    setStructuredRaw('')
    setJsonError('')
    setError('')
    setDialogOpen(true)
  }

  function openEdit(row: SeoPage) {
    setEditingId(row.id)
    setForm({
      path: row.path, title: row.title || '', description: row.description || '',
      og_title: row.og_title || '', og_description: row.og_description || '',
      og_image: row.og_image || '', canonical: row.canonical || '',
      noindex: row.noindex, structured_data: row.structured_data,
    })
    setStructuredRaw(row.structured_data ? JSON.stringify(row.structured_data, null, 2) : '')
    setJsonError('')
    setError('')
    setDialogOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.path.trim()) { setError('Path is required'); return }
    let structured: object | undefined
    if (structuredRaw.trim()) {
      try { structured = JSON.parse(structuredRaw) }
      catch { setJsonError('Invalid JSON'); return }
    }
    setSaving(true)
    setError('')
    const payload = { ...form, path: form.path.trim(), structured_data: structured ?? null }
    const { error: err } = editingId
      ? await supabase.from('seo_pages').update(payload).eq('id', editingId)
      : await supabase.from('seo_pages').upsert([payload], { onConflict: 'path' })
    setSaving(false)
    if (err) { setError(err.message); return }
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this SEO override?')) return
    await supabase.from('seo_pages').delete().eq('id', id)
    load()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">SEO Pages</h1>
          <p className="text-muted-foreground text-sm mt-1">Per-page meta title, description, and Open Graph overrides</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add override</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-border rounded-lg">
          <Search className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">No SEO overrides yet</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Add per-page meta overrides above</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Path</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>noindex</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs text-foreground">{row.path}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{row.title || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[260px] truncate">{row.description || '—'}</TableCell>
                <TableCell>
                  {row.noindex
                    ? <Badge variant="destructive" className="text-xs">noindex</Badge>
                    : <Badge variant="secondary" className="text-xs">index</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(row.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) setEditingId(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit SEO override' : 'Add SEO override'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {/* Path */}
            <div className="flex flex-col gap-1.5">
              <Label>Path *</Label>
              <Select value={form.path} onValueChange={v => setForm(f => ({ ...f, path: v }))}>
                <SelectTrigger><SelectValue placeholder="Select or type a path" /></SelectTrigger>
                <SelectContent>
                  {KNOWN_PATHS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                value={form.path}
                onChange={e => setForm(f => ({ ...f, path: e.target.value }))}
                placeholder="Custom path, e.g. /blog/my-post"
                className="mt-1"
              />
            </div>

            <Separator />
            <p className="text-sm font-medium text-foreground">Meta tags</p>

            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input value={form.title ?? ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Page title (overrides default)" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Meta description (150–160 chars)" />
            </div>

            <Separator />
            <p className="text-sm font-medium text-foreground">Open Graph</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>OG Title</Label>
                <Input value={form.og_title ?? ''} onChange={e => setForm(f => ({ ...f, og_title: e.target.value }))} placeholder="Social share title" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>OG Image URL</Label>
                <Input value={form.og_image ?? ''} onChange={e => setForm(f => ({ ...f, og_image: e.target.value }))} placeholder="https://..." />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>OG Description</Label>
              <Textarea rows={2} value={form.og_description ?? ''} onChange={e => setForm(f => ({ ...f, og_description: e.target.value }))} placeholder="Social share description" />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Canonical URL</Label>
                <Input value={form.canonical ?? ''} onChange={e => setForm(f => ({ ...f, canonical: e.target.value }))} placeholder="https://..." />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch id="noindex" checked={form.noindex} onCheckedChange={c => setForm(f => ({ ...f, noindex: c }))} />
                <Label htmlFor="noindex">noindex (hide from search)</Label>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Structured data (JSON-LD)</Label>
              <Textarea
                rows={6}
                value={structuredRaw}
                onChange={e => { setStructuredRaw(e.target.value); setJsonError('') }}
                placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "WebPage"\n}'}
                className="font-mono text-xs"
              />
              {jsonError && <p className="text-destructive text-xs">{jsonError}</p>}
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
