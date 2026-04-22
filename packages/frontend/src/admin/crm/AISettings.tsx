import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_CRM_RUNTIME_SETTINGS, getCRMRuntimeSettings, type AIProvider, type CRMRuntimeSettings } from '@/lib/ai'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import toast from 'react-hot-toast'
import { Settings, Loader2, CheckCircle2, AlertCircle, Mail, Save, Eye, EyeOff, Zap, RefreshCw, BrainCircuit } from 'lucide-react'

const providerMeta: Array<{
  provider: AIProvider
  label: string
  modelKey: keyof CRMRuntimeSettings
  modelsKey: keyof CRMRuntimeSettings
  secretKey?: keyof CRMRuntimeSettings
  endpointKey?: keyof CRMRuntimeSettings
  placeholder: string
}> = [
  { provider: 'anthropic', label: 'Anthropic', modelKey: 'anthropic_model', modelsKey: 'anthropic_models', secretKey: 'anthropic_api_key', placeholder: 'claude-sonnet-4-20250514' },
  { provider: 'openai', label: 'OpenAI', modelKey: 'openai_model', modelsKey: 'openai_models', secretKey: 'openai_api_key', placeholder: 'gpt-4o-mini' },
  { provider: 'gemini', label: 'Gemini', modelKey: 'gemini_model', modelsKey: 'gemini_models', secretKey: 'gemini_api_key', placeholder: 'gemini-2.5-flash' },
  { provider: 'perplexity', label: 'Perplexity', modelKey: 'perplexity_model', modelsKey: 'perplexity_models', secretKey: 'perplexity_api_key', placeholder: 'sonar' },
  { provider: 'ollama', label: 'Ollama', modelKey: 'ollama_model', modelsKey: 'ollama_models', endpointKey: 'ollama_base_url', placeholder: 'llama3.1' },
]

export default function AISettings() {
  const [settings, setSettings] = useState<CRMRuntimeSettings>(DEFAULT_CRM_RUNTIME_SETTINGS)
  const [providerStatuses, setProviderStatuses] = useState<Record<string, boolean>>({})
  const [showPass, setShowPass] = useState(false)
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({})
  const [secretValues, setSecretValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [fetchingProvider, setFetchingProvider] = useState<AIProvider | null>(null)
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => { void load() }, [])

  const activeProviderMeta = useMemo(
    () => providerMeta.find(entry => entry.provider === settings.active_ai_provider) ?? providerMeta[0],
    [settings.active_ai_provider],
  )

  async function load() {
    setLoading(true)
    try {
      setSettings(await getCRMRuntimeSettings())
      const { data } = await supabase.rpc('list_provider_credentials')
      if (data) {
        const statuses: Record<string, boolean> = {}
        data.forEach((row: any) => {
          statuses[row.provider] = row.has_key
        })
        setProviderStatuses(statuses)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load CRM settings')
    }
    setLoading(false)
  }

  async function saveAll(nextSettings?: CRMRuntimeSettings) {
    const payload = nextSettings ?? settings
    setSaving(true)
    
    // Save any newly entered secrets via RPC
    try {
      for (const [key, value] of Object.entries(secretValues)) {
        if (value) {
          const provider = key.replace('_api_key', '').replace('smtp_password', 'smtp')
          await supabase.rpc('set_provider_credential', {
            p_provider: provider,
            p_api_key: value
          })
          setProviderStatuses(prev => ({ ...prev, [provider]: true }))
        }
      }
      setSecretValues({}) // Clear secrets after saving
    } catch (err) {
      toast.error('Failed to save provider credentials')
    }

    const { error } = await supabase.from('crm_runtime_settings').upsert({ id: 1, ...payload })
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return false
    }
    setSettings(payload)
    toast.success('CRM runtime settings saved')
    return true
  }

  async function testSmtp() {
    if (!settings.smtp_from_email) {
      toast.error('Set a from email first')
      return
    }
    const saved = await saveAll()
    if (!saved) return
    setTestingSmtp(true)
    setSmtpTestResult(null)
    try {
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: settings.smtp_from_email,
          to_name: settings.smtp_from_name,
          subject: 'SMTP Test — Imba CRM',
          body: 'If you received this, your SMTP runtime settings are working correctly.',
        },
      })
      if (error) throw error
      setSmtpTestResult({ ok: true, message: 'Test email sent successfully.' })
      toast.success('SMTP test passed')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SMTP test failed'
      setSmtpTestResult({ ok: false, message })
      toast.error(message)
    }
    setTestingSmtp(false)
  }

  const setField = <K extends keyof CRMRuntimeSettings>(key: K, value: CRMRuntimeSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const toggleSecret = (key: string) => {
    setVisibleSecrets(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function fetchModels(provider: AIProvider) {
    setFetchingProvider(provider)
    try {
      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: { action: 'fetch-models', provider, settings },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const models = Array.isArray(data?.models) ? data.models.filter((item: unknown): item is string => typeof item === 'string') : []
      const meta = providerMeta.find(entry => entry.provider === provider)
      if (!meta) return

      const nextSettings = { ...settings }
      const nextSettingsRecord = nextSettings as Record<string, unknown>
      nextSettingsRecord[meta.modelsKey] = models

      const currentModel = String(nextSettings[meta.modelKey] || '')
      if (!currentModel && models[0]) {
        nextSettingsRecord[meta.modelKey] = models[0]
      }
      if (nextSettings.active_ai_provider === provider) {
        nextSettings.active_ai_model = String(nextSettings[meta.modelKey] || models[0] || '')
      }

      const saved = await saveAll(nextSettings)
      if (saved) toast.success(`${meta.label} models updated (${models.length})`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch models')
    }
    setFetchingProvider(null)
  }

  if (loading) return <div className="flex justify-center items-center py-32"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Settings className="h-5 w-5 text-amber-500" />
        <h1 className="text-2xl font-semibold">CRM Settings</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-10">Centralized runtime settings for AI providers, SMTP delivery and company context.</p>

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <BrainCircuit className="h-4 w-4 text-amber-500" />
          <h2 className="font-medium">AI Runtime</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">CRM AI runs server-side through the ai-proxy Edge Function, using database-backed provider credentials and runtime defaults.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div className="flex flex-col gap-1.5">
            <Label>Active provider</Label>
            <Select value={settings.active_ai_provider} onValueChange={(provider: AIProvider) => {
              const meta = providerMeta.find(entry => entry.provider === provider)
              setSettings(prev => ({
                ...prev,
                active_ai_provider: provider,
                active_ai_model: meta ? String(prev[meta.modelKey] || prev.active_ai_model || '') : prev.active_ai_model,
              }))
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {providerMeta.map(entry => <SelectItem key={entry.provider} value={entry.provider}>{entry.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label>Active model for CRM operations</Label>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px] gap-3">
              <Input
                value={settings.active_ai_model}
                onChange={e => setField('active_ai_model', e.target.value)}
                placeholder={activeProviderMeta.placeholder}
              />
              <Select value={settings.active_ai_model} onValueChange={value => setField('active_ai_model', value)}>
                <SelectTrigger><SelectValue placeholder="Choose fetched model" /></SelectTrigger>
                <SelectContent>
                  {((settings[activeProviderMeta.modelsKey] as string[]) || []).length > 0
                    ? (settings[activeProviderMeta.modelsKey] as string[]).map(model => <SelectItem key={model} value={model}>{model}</SelectItem>)
                    : <SelectItem value={settings.active_ai_model || activeProviderMeta.placeholder}>{settings.active_ai_model || 'No fetched models yet'}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Temperature</Label>
            <Input type="number" min="0" max="1" step="0.1" value={settings.anthropic_temperature} onChange={e => setField('anthropic_temperature', Number(e.target.value) || 0)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Default outreach tone</Label>
            <Select value={settings.ai_outreach_tone} onValueChange={v => setField('ai_outreach_tone', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['professional', 'casual', 'direct', 'consultative', 'enthusiastic'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Daily outreach limit</Label>
            <Input type="number" min="1" value={settings.outreach_daily_limit} onChange={e => setField('outreach_daily_limit', Number(e.target.value) || 1)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-5">
          {providerMeta.map(meta => {
            const currentModels = (settings[meta.modelsKey] as string[]) || []
            const secretValue = meta.secretKey ? String(settings[meta.secretKey] || '') : ''
            const endpointValue = meta.endpointKey ? String(settings[meta.endpointKey] || '') : ''
            const modelValue = String(settings[meta.modelKey] || '')
            const isVisible = visibleSecrets[String(meta.secretKey)]
            return (
              <div key={meta.provider} className="rounded-lg border border-border/70 bg-card/40 p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{meta.label}</div>
                    <div className="text-xs text-muted-foreground">Configure credentials/defaults and optionally fetch models into the runtime settings table.</div>
                  </div>
                  <Button type="button" variant="outline" size="sm" disabled={fetchingProvider === meta.provider} onClick={() => void fetchModels(meta.provider)} className="gap-2">
                    {fetchingProvider === meta.provider ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Fetch models
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {meta.secretKey && (
                    <div className="flex flex-col gap-1.5">
                      <Label>{meta.label} API key</Label>
                      <div className="relative">
                        <Input
                          type={isVisible ? 'text' : 'password'}
                          value={secretValues[meta.secretKey as string] ?? ''}
                          onChange={e => setSecretValues(prev => ({ ...prev, [meta.secretKey as string]: e.target.value }))}
                          className="pr-10"
                          placeholder={providerStatuses[meta.provider] ? '•••••••• (Set)' : `Enter ${meta.label} API key`}
                        />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => toggleSecret(String(meta.secretKey))}>
                          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{providerStatuses[meta.provider] ? 'Key is configured. Enter a new one to replace it.' : 'Key is missing.'}</p>
                    </div>
                  )}
                  {meta.endpointKey && (
                    <div className="flex flex-col gap-1.5">
                      <Label>Ollama base URL</Label>
                      <Input value={endpointValue} onChange={e => setField(meta.endpointKey!, e.target.value)} placeholder="http://host.docker.internal:11434" />
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <Label>{meta.label} default model</Label>
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px] gap-3">
                      <Input
                        value={modelValue}
                        onChange={e => {
                          const nextValue = e.target.value
                          setSettings(prev => ({
                            ...prev,
                            [meta.modelKey]: nextValue,
                            ...(prev.active_ai_provider === meta.provider ? { active_ai_model: nextValue } : {}),
                          }))
                        }}
                        placeholder={meta.placeholder}
                      />
                      <Select value={modelValue || meta.placeholder} onValueChange={value => {
                        setSettings(prev => ({
                          ...prev,
                          [meta.modelKey]: value,
                          ...(prev.active_ai_provider === meta.provider ? { active_ai_model: value } : {}),
                        }))
                      }}>
                        <SelectTrigger><SelectValue placeholder="Choose fetched model" /></SelectTrigger>
                        <SelectContent>
                          {(currentModels.length > 0 ? currentModels : [modelValue || meta.placeholder]).map(model => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Fetched models cache</Label>
                    <Input readOnly value={currentModels.join(', ') || 'No models fetched yet'} className="text-xs" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col gap-4 mt-5">
          <div className="flex items-center gap-3">
            <Switch checked={settings.ai_auto_enrich} onCheckedChange={v => setField('ai_auto_enrich', v)} />
            <Label className="font-normal">Auto-enrich new leads</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={settings.ai_inbox_auto_categorize} onCheckedChange={v => setField('ai_inbox_auto_categorize', v)} />
            <Label className="font-normal">Auto-analyze inbox replies on open</Label>
          </div>
        </div>
      </section>

      <Separator className="mb-10" />

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="h-4 w-4 text-amber-500" />
          <h2 className="font-medium">SMTP Configuration</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Stored in the database and used only by the send-email Edge Function.</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-1.5"><Label>SMTP Host</Label><Input value={settings.smtp_host} onChange={e => setField('smtp_host', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Port</Label><Input value={settings.smtp_port} onChange={e => setField('smtp_port', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Username</Label><Input value={settings.smtp_username} onChange={e => setField('smtp_username', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5">
            <Label>Password / App password</Label>
            <div className="relative">
              <Input 
                type={showPass ? 'text' : 'password'} 
                value={secretValues['smtp_password'] ?? ''} 
                onChange={e => setSecretValues(prev => ({ ...prev, smtp_password: e.target.value }))} 
                className="pr-10"
                placeholder={providerStatuses['smtp'] ? '•••••••• (Set)' : 'Enter SMTP password'}
              />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPass(p => !p)}>
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">{providerStatuses['smtp'] ? 'Password is configured. Enter a new one to replace it.' : 'Password is missing.'}</p>
          </div>
          <div className="flex flex-col gap-1.5"><Label>From name</Label><Input value={settings.smtp_from_name} onChange={e => setField('smtp_from_name', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>From email</Label><Input value={settings.smtp_from_email} onChange={e => setField('smtp_from_email', e.target.value)} /></div>
        </div>
        <div className="flex items-center gap-2 mb-5">
          <Switch checked={settings.smtp_secure} onCheckedChange={v => setField('smtp_secure', v)} />
          <Label className="font-normal">Use SSL/TLS (port 465)</Label>
        </div>
        {smtpTestResult && (
          <div className={`flex items-center gap-2 text-sm p-3 rounded mb-4 ${smtpTestResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            {smtpTestResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {smtpTestResult.message}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={() => void saveAll()} disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings</Button>
          <Button variant="outline" onClick={testSmtp} disabled={testingSmtp || !settings.smtp_host || !settings.smtp_username} className="gap-2">{testingSmtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Test SMTP</Button>
        </div>
      </section>

      <Separator className="mb-10" />

      <section className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="h-4 w-4 text-amber-500" />
          <h2 className="font-medium">Company Profile</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Injected into CRM prompts for lead search, outreach and proposals.</p>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5"><Label>Company name</Label><Input value={settings.company_name} onChange={e => setField('company_name', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Description</Label><Input value={settings.company_description} onChange={e => setField('company_description', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Unique selling point</Label><Input value={settings.usp} onChange={e => setField('usp', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Meeting scheduling URL</Label><Input value={settings.scheduling_url} onChange={e => setField('scheduling_url', e.target.value)} placeholder="https://cal.com/your-name" /></div>
        </div>
      </section>
    </div>
  )
}
