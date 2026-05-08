import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@imba/shared/supabase'
import type { PromptVersion } from '@imba/shared/lib/prompts'
import { Badge } from '@imba/shared/ui/badge'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Label } from '@imba/shared/ui/label'
import { Textarea } from '@imba/shared/ui/textarea'
import { Separator } from '@imba/shared/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@imba/shared/ui/dialog'
import { TerminalSquare, Plus, Loader2, RefreshCw, Eye, CheckCircle2, Copy } from 'lucide-react'
import toast from 'react-hot-toast'

interface PromptGroup {
  prompt_key: string
  activeVersion: PromptVersion | null
  allVersions: PromptVersion[]
}

const EMPTY_PROMPT: Partial<PromptVersion> = {
  prompt_key: '',
  description: '',
  system_prompt: '',
  user_prompt: '',
  provider: '',
  model: '',
}

export default function PromptRegistry() {
  const [groups, setGroups] = useState<PromptGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<PromptGroup | null>(null)
  
  const [editorOpen, setEditorOpen] = useState(false)
  const [editForm, setEditForm] = useState<Partial<PromptVersion>>(EMPTY_PROMPT)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('crm_prompts')
      .select('*')
      .order('prompt_key', { ascending: true })
      .order('version', { ascending: false })

    if (error) {
      toast.error('Failed to load prompts')
      setLoading(false)
      return
    }

    const grouped = new Map<string, PromptGroup>()
    for (const row of (data || []) as PromptVersion[]) {
      if (!grouped.has(row.prompt_key)) {
        grouped.set(row.prompt_key, {
          prompt_key: row.prompt_key,
          activeVersion: null,
          allVersions: []
        })
      }
      const group = grouped.get(row.prompt_key)!
      group.allVersions.push(row)
      if (row.is_active) {
        group.activeVersion = row
      }
    }

    const groupsArr = Array.from(grouped.values())
    setGroups(groupsArr)
    
    if (selectedGroup) {
      const updatedSelected = groupsArr.find(g => g.prompt_key === selectedGroup.prompt_key)
      setSelectedGroup(updatedSelected || null)
    }
    
    setLoading(false)
  }, [selectedGroup])

  useEffect(() => { void load() }, [load])

  function openNewPrompt() {
    setEditForm(EMPTY_PROMPT)
    setEditorOpen(true)
  }

  function openNewVersion(source: PromptVersion) {
    setEditForm({
      prompt_key: source.prompt_key,
      description: source.description,
      system_prompt: source.system_prompt,
      user_prompt: source.user_prompt,
      provider: source.provider,
      model: source.model,
    })
    setEditorOpen(true)
  }

  async function handleSaveVersion(e: React.FormEvent) {
    e.preventDefault()
    if (!editForm.prompt_key || !editForm.user_prompt) {
      toast.error('Prompt key and User prompt are required')
      return
    }

    setSaving(true)
    
    // Determine the next version number
    let nextVersion = 1
    const existingGroup = groups.find(g => g.prompt_key === editForm.prompt_key)
    if (existingGroup && existingGroup.allVersions.length > 0) {
      nextVersion = Math.max(...existingGroup.allVersions.map(v => v.version)) + 1
    }

    const payload = {
      prompt_key: editForm.prompt_key,
      version: nextVersion,
      description: editForm.description || null,
      system_prompt: editForm.system_prompt || null,
      user_prompt: editForm.user_prompt,
      provider: editForm.provider || null,
      model: editForm.model || null,
      is_active: false // New versions start inactive
    }

    const { error } = await supabase.from('crm_prompts').insert(payload)
    
    setSaving(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(`Created version ${nextVersion} for ${editForm.prompt_key}`)
      setEditorOpen(false)
      void load()
    }
  }

  async function setActiveVersion(version: PromptVersion) {
    if (version.is_active) return
    
    // In a real app, this might be done safely in a single transaction via an RPC.
    // Here we'll do it sequentially.
    const { error: err1 } = await supabase
      .from('crm_prompts')
      .update({ is_active: false })
      .eq('prompt_key', version.prompt_key)
      .eq('is_active', true)
      
    if (err1) {
      toast.error(err1.message)
      return
    }
    
    const { error: err2 } = await supabase
      .from('crm_prompts')
      .update({ is_active: true })
      .eq('id', version.id)
      
    if (err2) {
      toast.error(err2.message)
      return
    }
    
    toast.success(`Version ${version.version} set as active`)
    void load()
  }

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col h-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <TerminalSquare className="h-6 w-6 text-emerald-500" />
            Prompt Registry
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage AI prompts and versions used across the CRM.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={openNewPrompt} className="gap-2">
            <Plus className="h-4 w-4" /> New Prompt
          </Button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left pane: prompt keys */}
        <div className="w-1/3 flex flex-col border border-border rounded-lg bg-card overflow-hidden">
          <div className="p-3 border-b border-border bg-muted/20 font-medium text-sm text-muted-foreground">
            Prompts ({groups.length})
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && groups.length === 0 ? (
               <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : groups.length === 0 ? (
               <div className="p-8 text-center text-sm text-muted-foreground">No prompts registered yet.</div>
            ) : (
              <div className="flex flex-col">
                {groups.map(g => (
                  <button
                    key={g.prompt_key}
                    onClick={() => setSelectedGroup(g)}
                    className={`text-left p-4 border-b border-border last:border-0 hover:bg-muted/10 transition-colors ${selectedGroup?.prompt_key === g.prompt_key ? 'bg-muted/20 border-l-4 border-l-primary' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-sm font-semibold">{g.prompt_key}</span>
                      {g.activeVersion && <Badge variant="outline" className="text-[0.6rem] h-5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">v{g.activeVersion.version} active</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{g.activeVersion?.description || `${g.allVersions.length} versions`}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right pane: versions */}
        <div className="flex-1 border border-border rounded-lg bg-card flex flex-col min-h-0">
          {selectedGroup ? (
            <>
              <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
                <div>
                  <h2 className="font-mono font-bold text-lg">{selectedGroup.prompt_key}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedGroup.allVersions.length} versions</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {selectedGroup.allVersions.map(v => (
                  <div key={v.id} className={`border rounded-lg p-4 ${v.is_active ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold">v{v.version}</span>
                        {v.is_active && <Badge variant="default" className="text-[0.6rem] h-5 bg-emerald-500 hover:bg-emerald-600">Active</Badge>}
                        <span className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex gap-2">
                        {!v.is_active && (
                          <Button size="sm" variant="outline" onClick={() => void setActiveVersion(v)} className="h-7 text-xs">
                            Set Active
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => openNewVersion(v)} className="h-7 text-xs gap-1.5">
                          <Copy className="h-3.5 w-3.5" /> Duplicate
                        </Button>
                      </div>
                    </div>
                    
                    {v.description && <p className="text-sm mb-4 text-foreground/80">{v.description}</p>}
                    
                    {v.system_prompt && (
                      <div className="mb-4">
                        <p className="text-xs font-mono text-muted-foreground mb-1 uppercase tracking-wider">System Prompt</p>
                        <pre className="text-xs whitespace-pre-wrap font-mono bg-background border border-border rounded p-3 text-muted-foreground">
                          {v.system_prompt}
                        </pre>
                      </div>
                    )}
                    
                    <div>
                      <p className="text-xs font-mono text-muted-foreground mb-1 uppercase tracking-wider">User Prompt</p>
                      <pre className="text-xs whitespace-pre-wrap font-mono bg-background border border-border rounded p-3 text-muted-foreground">
                        {v.user_prompt}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Eye className="h-10 w-10 mb-4 opacity-20" />
              <p className="text-sm">Select a prompt to view its versions.</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editForm.prompt_key ? `New version for ${editForm.prompt_key}` : 'Create New Prompt'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveVersion} className="flex flex-col gap-4 mt-2">
            {!editForm.prompt_key || !groups.find(g => g.prompt_key === editForm.prompt_key) ? (
              <div>
                <Label>Prompt Key</Label>
                <Input 
                  value={editForm.prompt_key || ''} 
                  onChange={e => setEditForm(f => ({ ...f, prompt_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))} 
                  placeholder="e.g. outreach_email_gen"
                  className="font-mono mt-1"
                />
              </div>
            ) : null}
            
            <div>
              <Label>Description</Label>
              <Input 
                value={editForm.description || ''} 
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} 
                placeholder="What is this prompt used for?"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>System Prompt (Optional)</Label>
              <Textarea 
                value={editForm.system_prompt || ''} 
                onChange={e => setEditForm(f => ({ ...f, system_prompt: e.target.value }))} 
                className="font-mono text-xs min-h-[100px] mt-1"
                placeholder="You are an expert CRM assistant..."
              />
            </div>
            
            <div>
              <Label>User Prompt Template</Label>
              <Textarea 
                value={editForm.user_prompt || ''} 
                onChange={e => setEditForm(f => ({ ...f, user_prompt: e.target.value }))} 
                className="font-mono text-xs min-h-[150px] mt-1"
                placeholder="Write an email to {{lead_name}} from {{company_name}}..."
              />
              <p className="text-[0.65rem] text-muted-foreground mt-1">Use {'{{variable_name}}'} syntax for variables that will be injected at runtime.</p>
            </div>
            
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Version
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
