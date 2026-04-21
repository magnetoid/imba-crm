import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import {
  FileText, Loader2, Plus, Trash2, Copy, Check, Pencil, Sparkles, Mail, FileCode,
} from 'lucide-react'

interface Template {
  id: string
  type: 'email' | 'proposal' | 'follow_up'
  name: string
  subject: string | null
  content: string
  variables: string[]
  ai_generated: boolean
  use_count: number
  created_at: string
}

const TYPE_META: Record<string, { label: string; icon: typeof Mail; color: string }> = {
  email:     { label: 'Email',     icon: Mail,     color: 'text-blue-400' },
  proposal:  { label: 'Proposal',  icon: FileText, color: 'text-amber-400' },
  follow_up: { label: 'Follow-up', icon: FileCode, color: 'text-emerald-400' },
}

const EMPTY: Omit<Template, 'id' | 'created_at' | 'use_count' | 'ai_generated'> = {
  type: 'email', name: '', subject: '', content: '', variables: [],
}

function extractVariables(text: string): string[] {
  const matches = text.matchAll(/\{\{([^}]+)\}\}/g)
  return Array.from(new Set(Array.from(matches, m => `{{${m[1].trim()}}}`)))
}

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [editDialog, setEditDialog] = useState<Template | null>(null)
  const [createDialog, setCreateDialog] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('crm_templates').select('*').order('created_at', { ascending: false })
    setTemplates((data as Template[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveNew() {
    if (!form.name || !form.content) return
    setSaving(true)
    const vars = extractVariables((form.subject || '') + ' ' + form.content)
    const { error } = await supabase.from('crm_templates').insert({
      type: form.type, name: form.name, subject: form.subject || null,
      content: form.content, variables: vars, ai_generated: false,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Template saved')
    setCreateDialog(false)
    setForm(EMPTY)
    load()
  }

  async function saveEdit() {
    if (!editDialog) return
    setSaving(true)
    const vars = extractVariables((editDialog.subject || '') + ' ' + editDialog.content)
    const { error } = await supabase.from('crm_templates').update({
      name: editDialog.name, subject: editDialog.subject,
      content: editDialog.content, variables: vars,
    }).eq('id', editDialog.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Template updated')
    setEditDialog(null)
    load()
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return
    await supabase.from('crm_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
    toast.success('Deleted')
  }

  function copyTemplate(t: Template) {
    const text = t.subject ? `Subject: ${t.subject}\n\n${t.content}` : t.content
    navigator.clipboard.writeText(text)
    setCopied(t.id)
    setTimeout(() => setCopied(null), 2000)
  }

  const filtered = typeFilter === 'all' ? templates : templates.filter(t => t.type === typeFilter)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-amber-500" />
          <h1 className="text-2xl font-semibold">Templates</h1>
        </div>
        <Button size="sm" className="gap-2 bg-amber-500 hover:bg-amber-600 text-black"
          onClick={() => { setForm(EMPTY); setCreateDialog(true) }}>
          <Plus className="h-4 w-4" /> New template
        </Button>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Reusable email and proposal templates. Use <code className="text-amber-500">{`{{name}}`}</code>, <code className="text-amber-500">{`{{company}}`}</code> for placeholders.
      </p>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {['all', 'email', 'proposal', 'follow_up'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${typeFilter === t ? 'bg-amber-500/15 text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'all' ? `All (${templates.length})` : `${TYPE_META[t]?.label} (${templates.filter(x => x.type === t).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No templates yet. Create your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(t => {
            const meta = TYPE_META[t.type] || TYPE_META.email
            const Icon = meta.icon
            return (
              <div key={t.id} className="bg-card border border-border rounded-lg p-5 hover:border-border/60 transition-all">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Icon className={`h-4 w-4 flex-shrink-0 ${meta.color}`} />
                    <span className="text-sm font-medium truncate">{t.name}</span>
                    {t.ai_generated && (
                      <Badge variant="secondary" className="text-xs gap-1 py-0 h-5 flex-shrink-0">
                        <Sparkles className="h-2.5 w-2.5" /> AI
                      </Badge>
                    )}
                  </div>
                  {t.use_count > 0 && (
                    <span className="text-xs font-mono text-muted-foreground flex-shrink-0">used {t.use_count}×</span>
                  )}
                </div>
                {t.subject && <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{t.subject}</p>}
                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed mb-3 whitespace-pre-wrap">{t.content}</p>
                {t.variables.length > 0 && (
                  <div className="flex gap-1 flex-wrap mb-3">
                    {t.variables.map(v => (
                      <code key={v} className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded font-mono">{v}</code>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-3 border-t border-border">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => copyTemplate(t)}>
                    {copied === t.id ? <><Check className="h-3 w-3 text-emerald-400" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditDialog(t)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteTemplate(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New template</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as 'email' | 'proposal' | 'follow_up' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="proposal">Proposal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Cold outreach — brand video" />
              </div>
            </div>
            {form.type !== 'proposal' && (
              <div className="flex flex-col gap-1.5">
                <Label>Subject</Label>
                <Input value={form.subject || ''} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Quick idea for {{company}}" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Content *</Label>
              <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={10} className="font-mono text-sm" placeholder="Hi {{name}}, ..." />
              <p className="text-xs text-muted-foreground">Use {`{{name}}`}, {`{{company}}`}, {`{{service_interest}}`} as placeholders.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={saveNew} disabled={saving || !form.name || !form.content}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editDialog} onOpenChange={open => !open && setEditDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit template</DialogTitle></DialogHeader>
          {editDialog && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={editDialog.name} onChange={e => setEditDialog(p => p ? { ...p, name: e.target.value } : p)} />
              </div>
              {editDialog.type !== 'proposal' && (
                <div className="flex flex-col gap-1.5">
                  <Label>Subject</Label>
                  <Input value={editDialog.subject || ''} onChange={e => setEditDialog(p => p ? { ...p, subject: e.target.value } : p)} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Content</Label>
                <Textarea value={editDialog.content} onChange={e => setEditDialog(p => p ? { ...p, content: e.target.value } : p)} rows={12} className="font-mono text-sm" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
