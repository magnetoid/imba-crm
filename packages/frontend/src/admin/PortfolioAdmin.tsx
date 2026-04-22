import { useState, useEffect } from 'react'
import { supabase } from '@imba/shared/supabase'
import type { PortfolioItem } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Label } from '@imba/shared/ui/label'
import { Textarea } from '@imba/shared/ui/textarea'
import { Badge } from '@imba/shared/ui/badge'
import { Switch } from '@imba/shared/ui/switch'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@imba/shared/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@imba/shared/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@imba/shared/ui/select'
import { Plus, Pencil, Trash2, Loader2, Image } from 'lucide-react'
import toast from 'react-hot-toast'
import { isAdminUser } from '@/admin/utils/adminPermissions'

const CATEGORIES = [
  { value: 'brand',     label: 'Brand & Commercial' },
  { value: 'ai',        label: 'AI Video' },
  { value: 'product',   label: 'Product' },
  { value: 'social',    label: 'Social Media' },
  { value: 'cooking',   label: 'Cooking' },
  { value: 'drone',     label: 'Drone & Aerial' },
  { value: 'post',      label: 'Post Production' },
  { value: 'elearning', label: 'E-Learning' },
  { value: 'fashion',   label: 'Fashion' },
  { value: 'testimonial', label: 'Testimonial' },
]

const EMPTY_FORM = {
  title: '',
  slug: '',
  category: 'brand' as PortfolioItem['category'],
  client_name: '',
  youtube_id: '',
  vimeo_id: '',
  description: '',
  tags: '',
  featured: false,
  homepage_featured: false,
  published: true,
  sort_order: 0,
}

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function PortfolioAdmin() {
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [listError, setListError] = useState('')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  async function load() {
    setLoading(true)
    setListError('')
    const { data, error: err } = await supabase
      .from('portfolio_items')
      .select('*')
      .order('sort_order')
    if (err) {
      console.error('Failed to load portfolio_items', err)
      setListError(err.message)
      toast.error(`Portfolio failed to load: ${err.message}`)
      setItems([])
      setLoading(false)
      return
    }
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => {
    isAdminUser()
      .then(setIsAdmin)
      .catch((e) => {
        console.error('Admin check failed', e)
        setIsAdmin(false)
      })
    load()
  }, [])

  function startAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setDialogOpen(true)
  }

  function startEdit(item: PortfolioItem) {
    setEditingId(item.id)
    setForm({
      title: item.title,
      slug: item.slug,
      category: item.category,
      client_name: item.client_name || '',
      youtube_id: item.youtube_id || '',
      vimeo_id: item.vimeo_id || '',
      description: item.description || '',
      tags: item.tags ? item.tags.join(', ') : '',
      featured: item.featured,
      homepage_featured: item.homepage_featured || false,
      published: item.published,
      sort_order: item.sort_order,
    })
    setError('')
    setDialogOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      slug: form.slug || toSlug(form.title),
    }
    if (editingId) {
      const { error: err } = await supabase.from('portfolio_items').update(payload).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('portfolio_items').insert([payload])
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this portfolio item?')) return
    const { error: err } = await supabase.from('portfolio_items').delete().eq('id', id)
    if (err) {
      console.error('Failed to delete portfolio item', err)
      toast.error(err.message)
      return
    }
    load()
  }

  async function togglePublished(item: PortfolioItem) {
    const { error: err } = await supabase.from('portfolio_items').update({ published: !item.published }).eq('id', item.id)
    if (err) {
      console.error('Failed to toggle portfolio item', err)
      toast.error(err.message)
      return
    }
    load()
  }

  const filtered = categoryFilter === 'all' ? items : items.filter(i => i.category === categoryFilter)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Portfolio</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your work showcase</p>
        </div>
        <Button onClick={startAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add item
        </Button>
      </div>

      {isAdmin === false && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Your session is not recognized as an admin by database RLS. If you created portfolio items but see none here,
          add your email to `public.admin_allowlist` (or set `role=admin` in JWT metadata), then sign out/in.
        </div>
      )}

      {listError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load portfolio: {listError}
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${categoryFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
        >
          All ({items.length})
        </button>
        {CATEGORIES.map(c => {
          const count = items.filter(i => i.category === c.value).length
          if (!count) return null
          return (
            <button
              key={c.value}
              onClick={() => setCategoryFilter(c.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${categoryFilter === c.value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
            >
              {c.label} ({count})
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-border rounded-lg">
          <Image className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">No items yet</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Thumb</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(item => (
              <TableRow key={item.id}>
                <TableCell>
                  {item.youtube_id ? (
                    <img
                      src={`https://img.youtube.com/vi/${item.youtube_id}/mqdefault.jpg`}
                      alt={item.title}
                      className="w-20 h-12 object-cover rounded border border-border"
                    />
                  ) : (
                    <div className="w-20 h-12 rounded border border-border bg-muted flex items-center justify-center">
                      <Image className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{item.title}</div>
                  <div className="text-xs text-muted-foreground font-mono">{item.slug}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {CATEGORIES.find(c => c.value === item.category)?.label ?? item.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{item.client_name || '—'}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{item.sort_order}</TableCell>
                <TableCell>
                  <Switch checked={item.published} onCheckedChange={() => togglePublished(item)} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(item)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) setEditingId(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit portfolio item' : 'Add portfolio item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-title">Title *</Label>
                <Input
                  id="p-title"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value, slug: f.slug || toSlug(e.target.value) }))}
                  placeholder="Video title"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-slug">Slug</Label>
                <Input
                  id="p-slug"
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: toSlug(e.target.value) }))}
                  placeholder="auto-generated-from-title"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as PortfolioItem['category'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-client">Client name</Label>
                <Input
                  id="p-client"
                  value={form.client_name}
                  onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                  placeholder="Client or brand"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-yt">YouTube ID</Label>
                <Input
                  id="p-yt"
                  value={form.youtube_id}
                  onChange={e => setForm(f => ({ ...f, youtube_id: e.target.value.trim() }))}
                  placeholder="e.g. dQw4w9WgXcQ"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-vimeo">Vimeo ID</Label>
                <Input
                  id="p-vimeo"
                  value={form.vimeo_id}
                  onChange={e => setForm(f => ({ ...f, vimeo_id: e.target.value.trim() }))}
                  placeholder="e.g. 123456789"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-desc">Description</Label>
              <Textarea
                id="p-desc"
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief project description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-tags">Tags (comma-separated)</Label>
                <Input
                  id="p-tags"
                  value={form.tags}
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="e.g. cinematic, brand, 4k"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-order">Sort order</Label>
                <Input
                  id="p-order"
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <Switch id="p-published" checked={form.published} onCheckedChange={c => setForm(f => ({ ...f, published: c }))} />
                <Label htmlFor="p-published">Published</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="p-featured" checked={form.featured} onCheckedChange={c => setForm(f => ({ ...f, featured: c }))} />
                <Label htmlFor="p-featured">Featured</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="p-homepage" checked={form.homepage_featured} onCheckedChange={c => setForm(f => ({ ...f, homepage_featured: c }))} />
                <Label htmlFor="p-homepage">Show on homepage</Label>
              </div>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
