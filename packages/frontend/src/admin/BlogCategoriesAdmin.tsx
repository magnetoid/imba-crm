import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { BlogCategory } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Loader2, Tag } from 'lucide-react'

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  parent_id: '',
}

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

interface CategoryWithCount extends BlogCategory {
  post_count?: number
}

export default function BlogCategoriesAdmin() {
  const [categories, setCategories] = useState<CategoryWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState('')
  const [postCounts, setPostCounts] = useState<Record<string, number>>({})

  async function load() {
    setLoading(true)
    const [catsRes, postsRes] = await Promise.all([
      supabase.from('blog_categories').select('*').order('name'),
      supabase.from('blog_posts').select('category_id').not('category_id', 'is', null),
    ])
    const cats: BlogCategory[] = catsRes.data || []
    const posts = postsRes.data || []

    const counts: Record<string, number> = {}
    for (const p of posts) {
      if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1
    }
    setPostCounts(counts)
    setCategories(cats)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setDialogOpen(true)
  }

  function startEdit(cat: BlogCategory) {
    setEditingId(cat.id)
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      parent_id: cat.parent_id || '',
    })
    setError('')
    setDialogOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    const payload = {
      name: form.name,
      slug: form.slug || toSlug(form.name),
      description: form.description || null,
      parent_id: form.parent_id || null,
    }
    if (editingId) {
      const { error: err } = await supabase.from('blog_categories').update(payload).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('blog_categories').insert([payload])
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this category? Posts will become uncategorised.')) return
    await supabase.from('blog_categories').delete().eq('id', id)
    load()
  }

  const parentOptions = categories.filter(c => c.id !== editingId)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Blog Categories</h1>
          <p className="text-muted-foreground text-sm mt-1">Organise your blog posts</p>
        </div>
        <Button onClick={startAdd}>
          <Plus className="h-4 w-4 mr-2" />
          New category
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-border rounded-lg">
          <Tag className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">No categories yet</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Create your first category above</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Posts</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map(cat => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium text-foreground">{cat.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{cat.slug}</TableCell>
                <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                  {cat.description || '—'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {cat.parent_id
                    ? categories.find(c => c.id === cat.parent_id)?.name || '—'
                    : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {postCounts[cat.id] || 0}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(cat)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(cat.id)}>
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

      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) setEditingId(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit category' : 'New category'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cat-name">Name *</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: f.slug || toSlug(e.target.value) }))}
                placeholder="e.g. AI Video"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cat-slug">Slug</Label>
              <Input
                id="cat-slug"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: toSlug(e.target.value) }))}
                placeholder="auto-generated"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Parent category</Label>
              <Select
                value={form.parent_id || '__none__'}
                onValueChange={val => setForm(f => ({ ...f, parent_id: val === '__none__' ? '' : val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None (top level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (top level)</SelectItem>
                  {parentOptions.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
