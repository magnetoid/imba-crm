import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import CharacterCount from '@tiptap/extension-character-count'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon,
  Image as ImageIcon, Code, Quote, Undo, Redo, Minus,
  Maximize2, Minimize2, Loader2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sanitizeHtml } from '@/utils/sanitizeHtml'
import { EDITOR_PRESETS, type EditorPreset } from './editorPresets'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

interface TiptapEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  preset?: EditorPreset
  moduleKey?: string
  autosave?: {
    enabled: boolean
    onAutosave: (value: string) => Promise<void>
    debounceMs?: number
  }
  collaboration?: {
    enabled: boolean
    docName: string
    user: { name: string; color?: string }
    wsUrl?: string
  }
}

function defaultWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/yjs`
}

function colorFromSeed(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return `hsl(${hue} 75% 55%)`
}

export default function TiptapEditor({
  value,
  onChange,
  placeholder = 'Write your blog post...',
  preset,
  moduleKey,
  autosave,
  collaboration,
}: TiptapEditorProps) {
  const presetResolved = preset || EDITOR_PRESETS.blog_body
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [autosaveState, setAutosaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const [autosaveError, setAutosaveError] = useState('')
  const autosaveTimer = useRef<number | null>(null)
  const seedingRef = useRef(false)

  const collabEnabled = !!collaboration?.enabled
  const ydoc = useMemo(() => (collabEnabled ? new Y.Doc() : null), [collabEnabled, collaboration?.docName])
  const wsUrl = useMemo(() => (collaboration?.wsUrl || (typeof window !== 'undefined' ? defaultWsUrl() : '')), [collaboration?.wsUrl])
  const provider = useMemo(() => {
    if (!collabEnabled || !ydoc) return null
    return new WebsocketProvider(wsUrl, collaboration!.docName, ydoc)
  }, [collabEnabled, wsUrl, collaboration?.docName, ydoc])

  const extensions = useMemo(() => {
    const ext: any[] = [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: presetResolved.limits?.chars }),
    ]

    if (collabEnabled && ydoc) {
      ext.push(
        Collaboration.configure({ document: ydoc }),
      )
      if (provider && collaboration?.user?.name) {
        ext.push(
          CollaborationCaret.configure({
            provider,
            user: {
              name: collaboration.user.name,
              color: collaboration.user.color || colorFromSeed(collaboration.user.name),
            },
          }),
        )
      }
    }

    if (presetResolved.features.images) {
      ext.push(Image.configure({ inline: false, allowBase64: false }))
    }
    if (presetResolved.features.tables) {
      ext.push(
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      )
    }
    return ext
  }, [placeholder, presetResolved.features.images, presetResolved.features.tables, presetResolved.limits?.chars, collabEnabled, ydoc, provider, collaboration?.user?.name, collaboration?.user?.color])

  async function uploadImage(file: File): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')
    const now = new Date()
    const path = `${moduleKey || 'content'}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}-${safeName}`
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('media')
      .upload(path, file, { contentType: file.type })
    if (uploadErr) throw uploadErr
    const { data: pub } = supabase.storage.from('media').getPublicUrl(uploadData.path)

    await supabase.from('media_files').insert([{
      filename: uploadData.path,
      original_name: file.name,
      mime_type: file.type,
      size: file.size,
      url: pub.publicUrl,
    }])
    return pub.publicUrl
  }

  const editor = useEditor({
    extensions,
    content: value,
    editorProps: {
      handlePaste: (_view, event) => {
        if (!presetResolved.features.images) return false
        const items = Array.from(event.clipboardData?.items || [])
        const files = items
          .map(i => (i.kind === 'file' ? i.getAsFile() : null))
          .filter((f): f is File => !!f && f.type.startsWith('image/'))
        if (!files.length) return false
        void (async () => {
          for (const file of files) {
            try {
              const url = await uploadImage(file)
              editor?.chain().focus().setImage({ src: url, alt: file.name }).run()
            } catch {
              setAutosaveError('Image upload failed')
              setAutosaveState('error')
            }
          }
        })()
        return true
      },
      handleDrop: (_view, event) => {
        if (!presetResolved.features.images) return false
        const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        void (async () => {
          for (const file of files) {
            try {
              const url = await uploadImage(file)
              editor?.chain().focus().setImage({ src: url, alt: file.name }).run()
            } catch {
              setAutosaveError('Image upload failed')
              setAutosaveState('error')
            }
          }
        })()
        return true
      },
    },
    onUpdate: ({ editor }) => {
      const html = sanitizeHtml(editor.getHTML())
      onChange(html)
      if (autosave?.enabled && !seedingRef.current) setAutosaveState('dirty')
      if (seedingRef.current) seedingRef.current = false
    },
  })

  useEffect(() => {
    return () => {
      provider?.destroy()
      ydoc?.destroy()
    }
  }, [provider, ydoc])

  useEffect(() => {
    if (!collabEnabled || !provider || !editor || !ydoc) return

    const frag = ydoc.getXmlFragment('prosemirror')
    const onSync = (isSynced: boolean) => {
      if (!isSynced) return
      if (frag.length === 0 && value && value.trim().length > 0) {
        seedingRef.current = true
        editor.commands.setContent(value)
        setAutosaveState('idle')
      }
    }

    provider.on('sync', onSync)
    return () => {
      provider.off('sync', onSync)
    }
  }, [collabEnabled, provider, editor, ydoc, value])

  useEffect(() => {
    if (!editor) return
    if (collabEnabled) return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editor, collabEnabled])

  useEffect(() => {
    if (!autosave?.enabled) return
    if (autosaveState !== 'dirty') return
    if (!editor) return

    const debounceMs = autosave.debounceMs ?? 1200
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(async () => {
      try {
        setAutosaveError('')
        setAutosaveState('saving')
        await autosave.onAutosave(sanitizeHtml(editor.getHTML()))
        setAutosaveState('saved')
      } catch (e: unknown) {
        setAutosaveError(e instanceof Error ? e.message : 'Autosave failed')
        setAutosaveState('error')
      }
    }, debounceMs)

    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    }
  }, [autosave, autosaveState, editor])

  if (!editor) {
    return (
      <div className="border border-input rounded-md bg-background p-4 text-muted-foreground text-sm flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading editor…
      </div>
    )
  }

  const btn = (active: boolean, onClick: () => void, title: string, icon: React.ReactNode) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
    >
      {icon}
    </button>
  )

  const toolbarSet = new Set(presetResolved.toolbar)

  const triggerUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return
    try {
      const url = await uploadImage(file)
      editor.chain().focus().setImage({ src: url, alt: file.name }).run()
    } catch (err: unknown) {
      setAutosaveError(err instanceof Error ? err.message : 'Image upload failed')
      setAutosaveState('error')
    }
  }

  const setLink = () => {
    const url = window.prompt('URL:', editor.getAttributes('link').href)
    if (url === null) return
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const counts = presetResolved.features.counts ? {
    words: editor.storage.characterCount.words(),
    chars: editor.storage.characterCount.characters(),
    limit: presetResolved.limits?.chars,
  } : null

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-[60] bg-background p-4 md:p-6'
    : ''

  const editorCard = (
    <div className="border border-input rounded-md overflow-hidden bg-background flex flex-col">
      <div className="flex flex-wrap gap-0.5 p-1.5 border-b border-input bg-muted/30 items-center">
        {toolbarSet.has('bold') && btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold', <Bold className="w-3.5 h-3.5" />)}
        {toolbarSet.has('italic') && btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic', <Italic className="w-3.5 h-3.5" />)}
        {toolbarSet.has('underline') && btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline', <UnderlineIcon className="w-3.5 h-3.5" />)}
        {toolbarSet.has('strike') && btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Strike', <Strikethrough className="w-3.5 h-3.5" />)}

        <div className="w-px bg-border mx-0.5" />
        {toolbarSet.has('h1') && btn(editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'Heading 1', <Heading1 className="w-3.5 h-3.5" />)}
        {toolbarSet.has('h2') && btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Heading 2', <Heading2 className="w-3.5 h-3.5" />)}
        {toolbarSet.has('h3') && btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'Heading 3', <Heading3 className="w-3.5 h-3.5" />)}

        <div className="w-px bg-border mx-0.5" />
        {toolbarSet.has('alignLeft') && btn(editor.isActive({ textAlign: 'left' }), () => editor.chain().focus().setTextAlign('left').run(), 'Align left', <AlignLeft className="w-3.5 h-3.5" />)}
        {toolbarSet.has('alignCenter') && btn(editor.isActive({ textAlign: 'center' }), () => editor.chain().focus().setTextAlign('center').run(), 'Align center', <AlignCenter className="w-3.5 h-3.5" />)}
        {toolbarSet.has('alignRight') && btn(editor.isActive({ textAlign: 'right' }), () => editor.chain().focus().setTextAlign('right').run(), 'Align right', <AlignRight className="w-3.5 h-3.5" />)}

        <div className="w-px bg-border mx-0.5" />
        {toolbarSet.has('bulletList') && btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Bullet list', <List className="w-3.5 h-3.5" />)}
        {toolbarSet.has('orderedList') && btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Ordered list', <ListOrdered className="w-3.5 h-3.5" />)}
        {toolbarSet.has('blockquote') && btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), 'Quote', <Quote className="w-3.5 h-3.5" />)}
        {toolbarSet.has('code') && btn(editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), 'Code block', <Code className="w-3.5 h-3.5" />)}

        <div className="w-px bg-border mx-0.5" />
        {toolbarSet.has('link') && btn(editor.isActive('link'), setLink, 'Link', <LinkIcon className="w-3.5 h-3.5" />)}
        {toolbarSet.has('image') && presetResolved.features.images && btn(false, triggerUpload, 'Insert image', <ImageIcon className="w-3.5 h-3.5" />)}
        {toolbarSet.has('table') && presetResolved.features.tables && btn(editor.isActive('table'), () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), 'Insert table', <span className="text-xs font-mono">Tbl</span>)}
        {toolbarSet.has('hr') && btn(false, () => editor.chain().focus().setHorizontalRule().run(), 'Divider', <Minus className="w-3.5 h-3.5" />)}

        <div className="w-px bg-border mx-0.5" />
        {toolbarSet.has('undo') && btn(false, () => editor.chain().focus().undo().run(), 'Undo', <Undo className="w-3.5 h-3.5" />)}
        {toolbarSet.has('redo') && btn(false, () => editor.chain().focus().redo().run(), 'Redo', <Redo className="w-3.5 h-3.5" />)}

        <div className="flex-1" />

        {presetResolved.features.fullscreen && (
          <button
            type="button"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={() => setIsFullscreen(v => !v)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFilePick}
      />

      <EditorContent
        editor={editor}
        className="prose prose-sm dark:prose-invert max-w-none min-h-[360px] p-4 focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[340px]"
      />

      {(counts || autosave?.enabled) && (
        <div className="border-t border-input bg-muted/20 px-3 py-2 flex items-center gap-3 text-xs text-muted-foreground">
          {counts && (
            <span className={counts.limit && counts.chars > counts.limit ? 'text-destructive' : ''}>
              Words {counts.words} • Chars {counts.chars}{counts.limit ? ` / ${counts.limit}` : ''}
            </span>
          )}
          <div className="flex-1" />
          {autosave?.enabled && (
            <span className="flex items-center gap-2">
              {autosaveState === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
              {autosaveState === 'dirty' && 'Unsaved changes'}
              {autosaveState === 'saving' && 'Saving…'}
              {autosaveState === 'saved' && 'Saved'}
              {autosaveState === 'idle' && 'Saved'}
              {autosaveState === 'error' && (
                <span className="text-destructive">{autosaveError || 'Autosave failed'}</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className={containerClass}>
      {editorCard}
    </div>
  )
}
