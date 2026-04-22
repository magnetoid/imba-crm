import { useState, useEffect, useRef } from 'react'
import { supabase } from '@imba/shared/supabase'
import type { BlogPost, BlogCategory } from '@imba/shared/supabase'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Label } from '@imba/shared/ui/label'
import { Textarea } from '@imba/shared/ui/textarea'
import { Badge } from '@imba/shared/ui/badge'
import { Switch } from '@imba/shared/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@imba/shared/ui/select'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@imba/shared/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@imba/shared/ui/dialog'
import { Separator } from '@imba/shared/ui/separator'
import { Plus, Pencil, Trash2, Loader2, FileText, Sparkles, X } from 'lucide-react'
import TiptapEditor from './TiptapEditor'
import { callAIText } from '@imba/shared/lib/ai'
import { EDITOR_PRESETS } from './editorPresets'

const EMPTY_FORM = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  cover_image_url: '',
  featured_image_url: '',
  category: '',
  category_id: '',
  tags: [] as string[],
  read_time_minutes: 5,
  published: false,
  status: 'draft' as 'draft' | 'published' | 'scheduled',
  author_name: '',
  seo_title: '',
  seo_description: '',
  og_image_url: '',
}

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function statusVariant(status?: string): 'secondary' | 'default' | 'outline' {
  if (status === 'published') return 'default'
  if (status === 'scheduled') return 'outline'
  return 'secondary'
}

export default function BlogAdmin() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [categories, setCategories] = useState<BlogCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [tagInput, setTagInput] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState('')
  const [collabUserName, setCollabUserName] = useState('')

  // AI Generator state
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const [postsRes, catsRes] = await Promise.all([
      supabase
        .from('blog_posts')
        .select('*, blog_categories(name, slug)')
        .order('created_at', { ascending: false }),
      supabase.from('blog_categories').select('*').order('name'),
    ])
    setPosts(postsRes.data || [])
    setCategories(catsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const name = data.user?.email || (data.user?.id ? `admin-${data.user.id.slice(0, 6)}` : 'admin')
      setCollabUserName(name)
    })
  }, [])

  function startAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setTagInput('')
    setError('')
    setDialogOpen(true)
  }

  function startEdit(post: BlogPost) {
    setEditingId(post.id)
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || '',
      body: post.body || '',
      cover_image_url: post.cover_image_url || '',
      featured_image_url: post.featured_image_url || '',
      category: post.category || '',
      category_id: post.category_id || '',
      tags: post.tags ? [...post.tags] : [],
      read_time_minutes: post.read_time_minutes ?? 5,
      published: post.published,
      status: post.status || 'draft',
      author_name: post.author_name || '',
      seo_title: post.seo_title || '',
      seo_description: post.seo_description || '',
      og_image_url: post.og_image_url || '',
    })
    setTagInput('')
    setError('')
    setDialogOpen(true)
  }

  function addTag() {
    const t = tagInput.trim()
    if (t && !form.tags.includes(t)) {
      setForm(f => ({ ...f, tags: [...f.tags, t] }))
    }
    setTagInput('')
    tagInputRef.current?.focus()
  }

  function removeTag(tag: string) {
    setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    const payload = {
      title: form.title,
      slug: form.slug || toSlug(form.title),
      excerpt: form.excerpt,
      body: form.body,
      cover_image_url: form.cover_image_url,
      featured_image_url: form.featured_image_url,
      category: form.category,
      category_id: form.category_id || null,
      tags: form.tags,
      read_time_minutes: form.read_time_minutes,
      published: form.published,
      status: form.status,
      author_name: form.author_name,
      seo_title: form.seo_title,
      seo_description: form.seo_description,
      og_image_url: form.og_image_url,
      published_at: form.published ? new Date().toISOString() : null,
    }
    if (editingId) {
      const { error: err } = await supabase.from('blog_posts').update(payload).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('blog_posts').insert([payload])
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function autosaveBody(html: string) {
    if (editingId) {
      const { error: err } = await supabase.from('blog_posts').update({ body: html }).eq('id', editingId)
      if (err) throw err
      return
    }
    localStorage.setItem('draft_blog_post_body', html)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this post?')) return
    await supabase.from('blog_posts').delete().eq('id', id)
    load()
  }

  async function togglePublished(post: BlogPost) {
    await supabase.from('blog_posts').update({
      published: !post.published,
      published_at: !post.published ? new Date().toISOString() : null,
      status: !post.published ? 'published' : 'draft',
    }).eq('id', post.id)
    load()
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim()) { setAiError('Please enter a topic/brief.'); return }
    setAiLoading(true)
    setAiError('')
    try {
      const text = await callAIText(`Generate a comprehensive blog post for a video production company (Imba Production) about: ${aiPrompt}. Return ONLY valid JSON (no markdown code blocks) with: title, slug, excerpt (2 sentences), body (markdown, 800+ words), category (one of: AI Video, Video Production, Brand Film, Social Media, Drone, Post Production, eCommerce), tags (array of strings), read_time_minutes, seo_title, seo_description`)
      
      let parsed: {
        title?: string
        slug?: string
        excerpt?: string
        body?: string
        category?: string
        tags?: string[]
        read_time_minutes?: number
        seo_title?: string
        seo_description?: string
      }
      try {
        // Strip markdown code blocks if present
        const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/```\s*$/m, '').trim()
        parsed = JSON.parse(cleaned)
      } catch {
        throw new Error('Could not parse AI response as JSON. Try again.')
      }
      setForm(f => ({
        ...f,
        title: parsed.title || f.title,
        slug: parsed.slug || toSlug(parsed.title || f.title),
        excerpt: parsed.excerpt || f.excerpt,
        body: parsed.body || f.body,
        category: parsed.category || f.category,
        tags: parsed.tags || f.tags,
        read_time_minutes: parsed.read_time_minutes || f.read_time_minutes,
        seo_title: parsed.seo_title || f.seo_title,
        seo_description: parsed.seo_description || f.seo_description,
      }))
      setAiOpen(false)
      setDialogOpen(true)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Blog</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage articles and insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { setAiOpen(true); setAiError(''); setAiPrompt('') }}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate with AI
          </Button>
          <Button onClick={startAdd}>
            <Plus className="h-4 w-4 mr-2" />
            New post
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-border rounded-lg">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">No posts yet</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Create your first article above</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Read time</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map(post => (
              <TableRow key={post.id}>
                <TableCell>
                  <div className="font-medium text-foreground">{post.title}</div>
                  <div className="text-xs text-muted-foreground font-mono">{post.slug}</div>
                </TableCell>
                <TableCell>
                  {post.blog_categories ? (
                    <Badge variant="secondary" className="text-xs">{post.blog_categories.name}</Badge>
                  ) : post.category ? (
                    <Badge variant="secondary" className="text-xs">{post.category}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(post.status)} className="text-xs capitalize">
                    {post.status || 'draft'}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {post.read_time_minutes ? `${post.read_time_minutes} min` : '—'}
                </TableCell>
                <TableCell>
                  <Switch checked={post.published} onCheckedChange={() => togglePublished(post)} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm font-mono text-xs">
                  {post.created_at ? new Date(post.created_at).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(post)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(post.id)}>
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
            <DialogTitle>{editingId ? 'Edit post' : 'New post'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {/* Title + Slug */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="b-title">Title *</Label>
                <Input
                  id="b-title"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value, slug: f.slug || toSlug(e.target.value) }))}
                  placeholder="Article title"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="b-slug">Slug</Label>
                <Input
                  id="b-slug"
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: toSlug(e.target.value) }))}
                  placeholder="auto-generated"
                />
              </div>
            </div>

            {/* Category + Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category_id || '__none__'}
                  onValueChange={val => {
                    if (val === '__none__') {
                      setForm(f => ({ ...f, category_id: '', category: '' }))
                    } else {
                      const cat = categories.find(c => c.id === val)
                      setForm(f => ({ ...f, category_id: val, category: cat?.name || '' }))
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No category</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={val => setForm(f => ({ ...f, status: val as 'draft' | 'published' | 'scheduled' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Author + Read time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="b-author">Author name</Label>
                <Input
                  id="b-author"
                  value={form.author_name}
                  onChange={e => setForm(f => ({ ...f, author_name: e.target.value }))}
                  placeholder="e.g. Imba Team"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="b-readtime">Read time (minutes)</Label>
                <Input
                  id="b-readtime"
                  type="number"
                  min={1}
                  value={form.read_time_minutes}
                  onChange={e => setForm(f => ({ ...f, read_time_minutes: parseInt(e.target.value) || 5 }))}
                />
              </div>
            </div>

            {/* Cover image + Featured image */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="b-cover">Cover image URL</Label>
                <Input
                  id="b-cover"
                  value={form.cover_image_url}
                  onChange={e => setForm(f => ({ ...f, cover_image_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="b-featured-img">Featured image URL</Label>
                <Input
                  id="b-featured-img"
                  value={form.featured_image_url}
                  onChange={e => setForm(f => ({ ...f, featured_image_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
            </div>

            {/* Excerpt */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-excerpt">Excerpt</Label>
              <Textarea
                id="b-excerpt"
                rows={2}
                value={form.excerpt}
                onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
                placeholder="Short description shown in listings"
              />
            </div>

            {/* Body */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-body">Body</Label>
              <TiptapEditor
                value={form.body}
                onChange={(html) => setForm(f => ({ ...f, body: html }))}
                placeholder="Write your blog post..."
                preset={EDITOR_PRESETS.blog_body}
                moduleKey="blog"
                autosave={{ enabled: dialogOpen, onAutosave: autosaveBody, debounceMs: 1200 }}
                collaboration={collabUserName ? {
                  enabled: true,
                  docName: editingId
                    ? `blog_posts:${editingId}`
                    : `blog_posts:new:${collabUserName.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
                  user: { name: collabUserName },
                } : undefined}
              />
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-1.5">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[2rem] p-2 border border-input rounded-md bg-background">
                {form.tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-full">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addTag() }
                    if (e.key === ',' ) { e.preventDefault(); addTag() }
                  }}
                  placeholder={form.tags.length === 0 ? 'Type tag + Enter' : 'Add more...'}
                  className="flex-1 min-w-[100px] outline-none bg-transparent text-sm"
                />
              </div>
            </div>

            {/* Published switch */}
            <div className="flex items-center gap-2">
              <Switch id="b-published" checked={form.published} onCheckedChange={c => setForm(f => ({ ...f, published: c, status: c ? 'published' : 'draft' }))} />
              <Label htmlFor="b-published">Published</Label>
            </div>

            <Separator />

            {/* SEO section */}
            <p className="text-sm font-medium text-foreground">SEO</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-seo-title">SEO title</Label>
              <Input
                id="b-seo-title"
                value={form.seo_title}
                onChange={e => setForm(f => ({ ...f, seo_title: e.target.value }))}
                placeholder="Override page title for search engines"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-seo-desc">SEO description</Label>
              <Textarea
                id="b-seo-desc"
                rows={2}
                value={form.seo_description}
                onChange={e => setForm(f => ({ ...f, seo_description: e.target.value }))}
                placeholder="Meta description (150–160 chars)"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-og-img">OG image URL</Label>
              <Input
                id="b-og-img"
                value={form.og_image_url}
                onChange={e => setForm(f => ({ ...f, og_image_url: e.target.value }))}
                placeholder="https://..."
              />
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

      {/* AI Generator Dialog */}
      <Dialog open={aiOpen} onOpenChange={open => { setAiOpen(open); if (!open) setAiError('') }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Generate post with AI
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ai-prompt">Post topic / brief</Label>
              <Textarea
                id="ai-prompt"
                rows={3}
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="e.g. How AI video is revolutionising ecommerce product pages in 2026"
              />
            </div>
            {aiError && <p className="text-destructive text-sm">{aiError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAiOpen(false)}>Cancel</Button>
            <Button onClick={handleAiGenerate} disabled={aiLoading}>
              {aiLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" />Generate</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
