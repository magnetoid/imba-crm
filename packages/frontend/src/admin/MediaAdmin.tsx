import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { MediaFile } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { Loader2, Upload, Grid, List, Copy, Trash2, Film, Image as ImageIcon, Check } from 'lucide-react'

type ViewMode = 'grid' | 'list'
type FilterType = 'all' | 'images' | 'videos'

function formatBytes(bytes?: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isVideo(mimeType?: string) {
  return mimeType?.startsWith('video/') ?? false
}

export default function MediaAdmin() {
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [view, setView] = useState<ViewMode>('grid')
  const [filter, setFilter] = useState<FilterType>('all')
  const [selected, setSelected] = useState<MediaFile | null>(null)
  const [editingAlt, setEditingAlt] = useState('')
  const [editingCaption, setEditingCaption] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('media_files')
      .select('*')
      .order('created_at', { ascending: false })
    setFiles(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = files.filter(f => {
    if (filter === 'images') return !isVideo(f.mime_type)
    if (filter === 'videos') return isVideo(f.mime_type)
    return true
  })

  async function uploadFiles(fileList: FileList) {
    if (!fileList.length) return
    setUploading(true)
    setUploadError('')
    for (const file of Array.from(fileList)) {
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('media')
        .upload(`${Date.now()}-${file.name}`, file, { contentType: file.type })
      if (uploadErr) {
        setUploadError(uploadErr.message)
        continue
      }
      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(uploadData.path)
      await supabase.from('media_files').insert([{
        filename: uploadData.path,
        original_name: file.name,
        mime_type: file.type,
        size: file.size,
        url: publicUrl,
      }])
    }
    setUploading(false)
    load()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) uploadFiles(e.target.files)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files)
  }, [])

  function selectFile(f: MediaFile) {
    setSelected(f)
    setEditingAlt(f.alt || '')
    setEditingCaption(f.caption || '')
    setCopied(false)
  }

  async function saveMeta() {
    if (!selected) return
    setSavingMeta(true)
    await supabase.from('media_files').update({
      alt: editingAlt,
      caption: editingCaption,
    }).eq('id', selected.id)
    setSavingMeta(false)
    setFiles(prev => prev.map(f => f.id === selected.id ? { ...f, alt: editingAlt, caption: editingCaption } : f))
    setSelected(s => s ? { ...s, alt: editingAlt, caption: editingCaption } : s)
  }

  async function deleteFile(f: MediaFile) {
    if (!confirm('Delete this file permanently?')) return
    await supabase.storage.from('media').remove([f.filename])
    await supabase.from('media_files').delete().eq('id', f.id)
    if (selected?.id === f.id) setSelected(null)
    load()
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-8 flex gap-6">
      {/* Main panel */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Media Library</h1>
            <p className="text-muted-foreground text-sm mt-1">{files.length} files</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}>
              {view === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Type filter */}
        <div className="flex gap-1.5 mb-5">
          {(['all', 'images', 'videos'] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-1.5 text-sm rounded-md transition-colors capitalize"
              style={{
                background: filter === f ? 'hsl(var(--primary))' : 'transparent',
                color: filter === f ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                border: '1px solid hsl(var(--border))',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-6 mb-6 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border'}`}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag & drop images or videos here, or{' '}
            <button type="button" className="text-primary underline" onClick={() => fileInputRef.current?.click()}>browse</button>
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">Max 50 MB per file</p>
        </div>

        {uploadError && <p className="text-destructive text-sm mb-4">{uploadError}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-border rounded-lg">
            <ImageIcon className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No files yet</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(f => (
              <button
                key={f.id}
                onClick={() => selectFile(f)}
                className={`group border rounded-lg overflow-hidden text-left transition-colors ${selected?.id === f.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}
              >
                <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {isVideo(f.mime_type) ? (
                    <Film className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <img src={f.url} alt={f.alt || f.original_name || ''} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs text-foreground truncate">{f.original_name || f.filename}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Preview</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(f => (
                <TableRow key={f.id} className="cursor-pointer" onClick={() => selectFile(f)}>
                  <TableCell>
                    <div className="w-10 h-10 rounded overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                      {isVideo(f.mime_type) ? (
                        <Film className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <img src={f.url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground text-sm">{f.original_name || f.filename}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{f.mime_type || '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatBytes(f.size)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm font-mono text-xs">
                    {f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="destructive" size="sm" onClick={e => { e.stopPropagation(); deleteFile(f) }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-72 flex-shrink-0 border border-border rounded-lg p-4 flex flex-col gap-4 self-start sticky top-6">
          {/* Preview */}
          <div className="aspect-video bg-muted rounded overflow-hidden flex items-center justify-center">
            {isVideo(selected.mime_type) ? (
              <video src={selected.url} controls className="w-full h-full object-contain" />
            ) : (
              <img src={selected.url} alt={selected.alt || ''} className="w-full h-full object-contain" />
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-foreground truncate">{selected.original_name || selected.filename}</p>
            <p className="text-xs text-muted-foreground">{selected.mime_type} · {formatBytes(selected.size)}</p>
            <p className="text-xs text-muted-foreground">
              {selected.created_at ? new Date(selected.created_at).toLocaleDateString() : ''}
            </p>
          </div>

          {/* URL copy */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">URL</Label>
            <div className="flex gap-1.5">
              <Input value={selected.url} readOnly className="text-xs" />
              <Button size="sm" variant="outline" onClick={() => copyUrl(selected.url)}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Alt text */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="media-alt" className="text-xs">Alt text</Label>
            <Input
              id="media-alt"
              value={editingAlt}
              onChange={e => setEditingAlt(e.target.value)}
              placeholder="Describe this image"
              className="text-xs"
            />
          </div>

          {/* Caption */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="media-caption" className="text-xs">Caption</Label>
            <Textarea
              id="media-caption"
              value={editingCaption}
              onChange={e => setEditingCaption(e.target.value)}
              rows={2}
              placeholder="Optional caption"
              className="text-xs"
            />
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={saveMeta} disabled={savingMeta} className="flex-1">
              {savingMeta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => deleteFile(selected)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
