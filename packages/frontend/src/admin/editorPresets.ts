export type EditorToolbarItem =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'code'
  | 'link'
  | 'image'
  | 'hr'
  | 'table'
  | 'undo'
  | 'redo'

export interface EditorPreset {
  toolbar: EditorToolbarItem[]
  features: {
    images?: boolean
    tables?: boolean
    fullscreen?: boolean
    counts?: boolean
  }
  limits?: {
    chars?: number
  }
}

export const EDITOR_PRESETS: Record<string, EditorPreset> = {
  blog_body: {
    toolbar: ['bold','italic','underline','strike','h1','h2','h3','bulletList','orderedList','blockquote','code','link','image','table','hr','undo','redo'],
    features: { images: true, tables: true, fullscreen: true, counts: true },
    limits: { chars: 100000 },
  },
  simple: {
    toolbar: ['bold','italic','underline','link','undo','redo'],
    features: { fullscreen: true, counts: true },
    limits: { chars: 20000 },
  },
}

