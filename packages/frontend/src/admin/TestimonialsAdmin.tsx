import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Testimonial } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Loader2, Star } from 'lucide-react'

const EMPTY_FORM = {
  client_name: '',
  client_role: '',
  client_company: '',
  client_avatar_url: '',
  text: '',
  rating: 5,
  featured: false,
  published: true,
}

type FormState = typeof EMPTY_FORM

export default function TestimonialsAdmin() {
  const [items, setItems] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('testimonials')
      .select('*')
      .order('created_at', { ascending: false })
    setItems((data as Testimonial[]) || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setDialogOpen(true)
  }

  function startEdit(item: Testimonial) {
    setEditingId(item.id)
    setForm({
      client_name: item.client_name,
      client_role: item.client_role || '',
      client_company: item.client_company || '',
      client_avatar_url: item.client_avatar_url || '',
      text: item.text,
      rating: item.rating ?? 5,
      featured: item.featured,
      published: item.published,
    })
    setError('')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.client_name.trim() || !form.text.trim()) {
      setError('Name and review text are required.')
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      client_name: form.client_name.trim(),
      client_role: form.client_role.trim() || null,
      client_company: form.client_company.trim() || null,
      client_avatar_url: form.client_avatar_url.trim() || null,
      text: form.text.trim(),
      rating: form.rating,
      featured: form.featured,
      published: form.published,
    }
    const { error: err } = editingId
      ? await supabase.from('testimonials').update(payload).eq('id', editingId)
      : await supabase.from('testimonials').insert(payload)
    if (err) {
      setError(err.message)
    } else {
      setDialogOpen(false)
      load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this testimonial?')) return
    await supabase.from('testimonials').delete().eq('id', id)
    load()
  }

  async function toggleField(id: string, field: 'published' | 'featured', value: boolean) {
    await supabase.from('testimonials').update({ [field]: value }).eq('id', id)
    setItems(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  const f = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Testimonials</h1>
          <p className="text-muted-foreground text-sm mt-1">{items.length} total · {items.filter(t => t.featured).length} featured</p>
        </div>
        <Button onClick={startAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Add testimonial
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <Star className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p>No testimonials yet. Add one above.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium text-sm">{item.client_name}</div>
                  {item.client_role && <div className="text-xs text-muted-foreground">{item.client_role}</div>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.client_company || '—'}</TableCell>
                <TableCell>
                  {item.rating ? (
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} className={`h-3.5 w-3.5 ${n <= item.rating! ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`} />
                      ))}
                    </div>
                  ) : '—'}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={item.featured}
                    onCheckedChange={v => toggleField(item.id, 'featured', v)}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={item.published}
                    onCheckedChange={v => toggleField(item.id, 'published', v)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}
                      className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Testimonial' : 'Add Testimonial'}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Client name *</Label>
                <Input value={form.client_name} onChange={f('client_name')} placeholder="Jane Smith" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <Input value={form.client_role} onChange={f('client_role')} placeholder="CEO" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Company</Label>
                <Input value={form.client_company} onChange={f('client_company')} placeholder="Acme Inc." />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Avatar URL</Label>
                <Input value={form.client_avatar_url} onChange={f('client_avatar_url')} placeholder="https://..." />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Review text *</Label>
              <Textarea value={form.text} onChange={f('text')} rows={4} placeholder="What did the client say?" />
            </div>

            {/* Rating */}
            <div className="flex flex-col gap-1.5">
              <Label>Rating</Label>
              <div className="flex gap-1">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => setForm(prev => ({ ...prev, rating: n }))}>
                    <Star className={`h-5 w-5 transition-colors ${n <= form.rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30 hover:text-amber-400'}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch id="featured" checked={form.featured}
                  onCheckedChange={v => setForm(prev => ({ ...prev, featured: v }))} />
                <Label htmlFor="featured">Featured</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="published" checked={form.published}
                  onCheckedChange={v => setForm(prev => ({ ...prev, published: v }))} />
                <Label htmlFor="published">Published</Label>
              </div>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
