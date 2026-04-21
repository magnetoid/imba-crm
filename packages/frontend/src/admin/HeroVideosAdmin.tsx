import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { HeroVideo } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, ExternalLink, Loader2, Film } from 'lucide-react'
import toast from 'react-hot-toast'
import { isAdminUser } from '@/admin/utils/adminPermissions'

const EMPTY_FORM = {
  youtube_id: '',
  title: '',
  slide_eyebrow: '',
  slide_headline: '',
  slide_headline_em: '',
  slide_subheadline: '',
  sort_order: 0,
  active: true,
}

export default function HeroVideosAdmin() {
  const [videos, setVideos] = useState<HeroVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  async function load() {
    setLoading(true)
    setListError('')
    const { data, error: err } = await supabase
      .from('hero_videos')
      .select('*')
      .order('sort_order')
    if (err) {
      console.error('Failed to load hero_videos', err)
      setListError(err.message)
      toast.error(`Hero videos failed to load: ${err.message}`)
      setVideos([])
      setLoading(false)
      return
    }
    setVideos(data || [])
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

  function startEdit(v: HeroVideo) {
    setEditingId(v.id)
    setForm({
      youtube_id: v.youtube_id,
      title: v.title,
      slide_eyebrow: v.slide_eyebrow || '',
      slide_headline: v.slide_headline || '',
      slide_headline_em: v.slide_headline_em || '',
      slide_subheadline: v.slide_subheadline || '',
      sort_order: v.sort_order,
      active: v.active,
    })
    setError('')
    setDialogOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.youtube_id.trim()) { setError('YouTube ID is required'); return }
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    if (editingId) {
      const { error: err } = await supabase.from('hero_videos').update(form).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('hero_videos').insert([form])
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    setDialogOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    load()
  }

  async function toggleActive(v: HeroVideo) {
    const { error: err } = await supabase.from('hero_videos').update({ active: !v.active }).eq('id', v.id)
    if (err) {
      console.error('Failed to toggle hero video', err)
      toast.error(err.message)
      return
    }
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this video from the slider?')) return
    const { error: err } = await supabase.from('hero_videos').delete().eq('id', id)
    if (err) {
      console.error('Failed to delete hero video', err)
      toast.error(err.message)
      return
    }
    load()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Hero Video Slider</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage homepage background videos
          </p>
        </div>
        <Button onClick={startAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add video
        </Button>
      </div>

      {isAdmin === false && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Your session is not recognized as an admin by database RLS. If you have hero videos in the DB but see none here,
          add your email to `public.admin_allowlist` (or set `role=admin` in JWT metadata), then sign out/in.
        </div>
      )}

      {listError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load hero videos: {listError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-border rounded-lg">
          <Film className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">No videos yet</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Add your first hero video above</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Thumbnail</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>YouTube ID</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {videos.map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  <img
                    src={`https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg`}
                    alt={v.title}
                    className="w-24 h-14 object-cover rounded border border-border"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </TableCell>
                <TableCell className="font-medium text-foreground">{v.title}</TableCell>
                <TableCell className="text-muted-foreground text-xs font-mono">{v.youtube_id}</TableCell>
                <TableCell className="text-muted-foreground">{v.sort_order}</TableCell>
                <TableCell>
                  <Badge variant={v.active ? 'success' : 'secondary'}>
                    {v.active ? 'Active' : 'Hidden'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={v.active}
                    onCheckedChange={() => toggleActive(v)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                    >
                      <a
                        href={`https://www.youtube.com/watch?v=${v.youtube_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(v)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(v.id)}
                    >
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

      <p className="text-muted-foreground/50 text-xs mt-6">
        Videos cycle every 10 seconds on the homepage. Update sort order values to change sequence.
      </p>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) setEditingId(null)
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit video' : 'Add video'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="youtube_id">YouTube Video ID *</Label>
                <Input
                  id="youtube_id"
                  placeholder="e.g. SgHHbWp64cE"
                  value={form.youtube_id}
                  onChange={e => setForm(f => ({ ...f, youtube_id: e.target.value.trim() }))}
                />
                <p className="text-xs text-muted-foreground">
                  Found after ?v= in youtube.com/watch?v=XXXXXXXXXXX
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Perfume Ad"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="slide_eyebrow">Eyebrow label</Label>
                <Input
                  id="slide_eyebrow"
                  placeholder="e.g. Brand & Commercial"
                  value={form.slide_eyebrow}
                  onChange={e => setForm(f => ({ ...f, slide_eyebrow: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="slide_headline">Headline — first line</Label>
                <Input
                  id="slide_headline"
                  placeholder="e.g. Stories that define"
                  value={form.slide_headline}
                  onChange={e => setForm(f => ({ ...f, slide_headline: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="slide_headline_em">Headline — italic gold line</Label>
                <Input
                  id="slide_headline_em"
                  placeholder="e.g. your brand."
                  value={form.slide_headline_em}
                  onChange={e => setForm(f => ({ ...f, slide_headline_em: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="slide_subheadline">Subheadline</Label>
                <Input
                  id="slide_subheadline"
                  placeholder="Supporting text under the headline"
                  value={form.slide_subheadline}
                  onChange={e => setForm(f => ({ ...f, slide_subheadline: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sort_order">Sort order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  id="active"
                  checked={form.active}
                  onCheckedChange={checked => setForm(f => ({ ...f, active: checked }))}
                />
                <Label htmlFor="active">Active (show on site)</Label>
              </div>
            </div>

            {/* Preview thumbnail */}
            {form.youtube_id && (
              <div className="flex flex-col gap-1.5">
                <Label>Preview</Label>
                <img
                  src={`https://img.youtube.com/vi/${form.youtube_id}/mqdefault.jpg`}
                  alt="thumbnail"
                  className="h-24 rounded border border-border object-cover w-auto"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setDialogOpen(false); setEditingId(null) }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
