import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@imba/shared/supabase'
import { DEFAULT_CRM_RUNTIME_SETTINGS, getCRMRuntimeSettings, type AIProvider, type CRMRuntimeSettings } from '@imba/shared/lib/ai'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Label } from '@imba/shared/ui/label'
import { Switch } from '@imba/shared/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@imba/shared/ui/select'
import toast from 'react-hot-toast'
import { Settings, Loader2, CheckCircle2, AlertCircle, Mail, Save, Eye, EyeOff, Zap, RefreshCw, BrainCircuit, Inbox } from 'lucide-react'

const providerMeta: Array<{
  provider: AIProvider
  label: string
  modelKey: keyof CRMRuntimeSettings
  modelsKey: keyof CRMRuntimeSettings
  secretKey?: string
  endpointKey?: keyof CRMRuntimeSettings
  placeholder: string
}> = [
  { provider: 'anthropic', label: 'Anthropic', modelKey: 'anthropic_model', modelsKey: 'anthropic_models', secretKey: 'anthropic_api_key', placeholder: 'claude-sonnet-4-20250514' },
  { provider: 'openai', label: 'OpenAI', modelKey: 'openai_model', modelsKey: 'openai_models', secretKey: 'openai_api_key', placeholder: 'gpt-4o-mini' },
  { provider: 'gemini', label: 'Gemini', modelKey: 'gemini_model', modelsKey: 'gemini_models', secretKey: 'gemini_api_key', placeholder: 'gemini-2.5-flash' },
  { provider: 'perplexity', label: 'Perplexity', modelKey: 'perplexity_model', modelsKey: 'perplexity_models', secretKey: 'perplexity_api_key', placeholder: 'sonar' },
  { provider: 'ollama', label: 'Ollama', modelKey: 'ollama_model', modelsKey: 'ollama_models', endpointKey: 'ollama_base_url', placeholder: 'llama3.1' },
  { provider: 'openrouter', label: 'OpenRouter', modelKey: 'openrouter_model', modelsKey: 'openrouter_models', secretKey: 'openrouter_api_key', placeholder: 'anthropic/claude-sonnet-4' },
]

type SettingsTab = 'ai' | 'nomo' | 'smtp' | 'imap' | 'pop3' | 'caps' | 'company'

const TABS: Array<{ id: SettingsTab; label: string; description: string }> = [
  { id: 'ai',      label: 'AI providers',  description: 'Models, keys, routing and outreach tone' },
  { id: 'nomo',    label: 'Nomo copilot',  description: 'Mode, autopilot allowlist, system prompt' },
  { id: 'smtp',    label: 'Outbound mail', description: 'SMTP delivery for outreach + replies' },
  { id: 'imap',    label: 'IMAP inbox',    description: 'Pull messages into the CRM via IMAP' },
  { id: 'pop3',    label: 'POP3 inbox',    description: 'Alternative inbound mail polling' },
  { id: 'caps',    label: 'Cost & limits', description: 'Monthly AI spend ceiling + cap action' },
  { id: 'company', label: 'Company',       description: 'Brand context the AI uses in prompts' },
]

// Tools shown in the Nomo autopilot allowlist editor. Keep in sync with
// packages/inbox-puller/src/nomo-tools.ts NOMO_TOOLS.
const NOMO_TOOL_OPTIONS: Array<{ name: string; label: string; write: boolean; danger?: boolean }> = [
  { name: 'search_leads',         label: 'Search leads',          write: false },
  { name: 'get_lead',             label: 'Get lead',              write: false },
  { name: 'query_pipeline',       label: 'Query pipeline',        write: false },
  { name: 'get_metrics',          label: 'Get metrics',           write: false },
  { name: 'summarize_period',     label: 'Summarize period',      write: false },
  { name: 'find_recent_signals',  label: 'Find recent signals',   write: false },
  { name: 'enqueue_agent',        label: 'Queue agent',           write: true, danger: true },
  { name: 'move_lead_stage',      label: 'Move lead stage',       write: true },
  { name: 'add_activity',         label: 'Add activity',          write: true },
  { name: 'set_follow_up',        label: 'Set follow-up',         write: true },
  { name: 'tick_exit_checklist',  label: 'Tick exit checklist',   write: true },
  { name: 'assign_lead',          label: 'Assign lead',           write: true, danger: true },
]

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60)   return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function PollStatus({
  enabled, lastSuccessAt, lastError, lastErrorAt, label,
}: {
  enabled: boolean
  lastSuccessAt: string | null | undefined
  lastError: string | null | undefined
  lastErrorAt: string | null | undefined
  label: string
}) {
  if (!enabled) {
    return (
      <div className="text-xs text-muted-foreground border border-border rounded p-2.5">
        {label} polling is disabled. Toggle it on and click Save to start.
      </div>
    )
  }
  if (lastError) {
    return (
      <div className="text-xs text-red-700 border border-red-400/30 bg-red-50 rounded p-2.5 flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <div>
          <div className="font-medium">{label} poll failed{lastErrorAt ? ` (${timeAgo(lastErrorAt)})` : ''}</div>
          <div className="opacity-90 break-words">{lastError}</div>
        </div>
      </div>
    )
  }
  if (lastSuccessAt) {
    return (
      <div className="text-xs text-emerald-700 border border-emerald-400/30 bg-emerald-50 rounded p-2.5 flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
        <span>{label} polling OK — last success {timeAgo(lastSuccessAt)}</span>
      </div>
    )
  }
  return (
    <div className="text-xs text-muted-foreground border border-border rounded p-2.5">
      Waiting for first {label} poll cycle… (next within poll-interval seconds)
    </div>
  )
}

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
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    if (typeof window === 'undefined') return 'ai'
    const hash = window.location.hash.replace('#', '') as SettingsTab
    return TABS.some(t => t.id === hash) ? hash : 'ai'
  })

  useEffect(() => { void load() }, [])

  // Sync active tab to URL hash so deep links into Settings work.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash !== `#${activeTab}`) {
      window.history.replaceState(null, '', `#${activeTab}`)
    }
  }, [activeTab])

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

  async function callTestEndpoint(kind: 'smtp' | 'imap' | 'pop3', enteredPassword?: string): Promise<{ ok: boolean; message: string }> {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return { ok: false, message: 'Not signed in.' }
    const res = await fetch(`/api/worker/test/${kind}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(enteredPassword ? { password: enteredPassword } : {}),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }
    return await res.json() as { ok: boolean; message: string }
  }

  async function testSmtp() {
    const saved = await saveAll()
    if (!saved) return
    setTestingSmtp(true)
    setSmtpTestResult(null)
    const result = await callTestEndpoint('smtp', secretValues['smtp_password'])
    setSmtpTestResult(result)
    if (result.ok) toast.success('SMTP login OK'); else toast.error(result.message)
    setTestingSmtp(false)
  }

  const [testingImap, setTestingImap] = useState(false)
  const [imapTestResult, setImapTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  async function testImap() {
    const saved = await saveAll()
    if (!saved) return
    setTestingImap(true)
    setImapTestResult(null)
    const result = await callTestEndpoint('imap', secretValues['imap_api_key'])
    setImapTestResult(result)
    if (result.ok) toast.success('IMAP login OK'); else toast.error(result.message)
    setTestingImap(false)
  }

  const [testingPop3, setTestingPop3] = useState(false)
  const [pop3TestResult, setPop3TestResult] = useState<{ ok: boolean; message: string } | null>(null)
  async function testPop3() {
    const saved = await saveAll()
    if (!saved) return
    setTestingPop3(true)
    setPop3TestResult(null)
    const result = await callTestEndpoint('pop3', secretValues['pop3_api_key'])
    setPop3TestResult(result)
    if (result.ok) toast.success('POP3 login OK'); else toast.error(result.message)
    setTestingPop3(false)
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
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Settings className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">CRM Settings</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Centralized runtime settings for AI providers, mail delivery, cost caps and company context.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-8">
        {/* Left rail — section navigation */}
        <nav className="lg:sticky lg:top-6 self-start space-y-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <div>{tab.label}</div>
              <div className="text-[11px] opacity-70 font-normal">{tab.description}</div>
            </button>
          ))}
        </nav>

        {/* Right pane — section bodies */}
        <div>

      {activeTab === 'ai' && <section className="mb-10">
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
            // We do not fetch actual secret values from the database to the browser
            // const isConfigured = providerStatuses[meta.provider]
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
      </section>}

      {activeTab === 'nomo' && (() => {
        const enabled       = settings.nomo_enabled ?? true
        const mode          = settings.nomo_mode ?? 'approval'
        const allowlist     = (settings.nomo_autopilot_tools ?? []) as string[]
        const systemPrompt  = settings.nomo_system_prompt ?? ''
        const isAutopilot   = mode === 'autopilot'
        function toggleTool(name: string) {
          setSettings(prev => {
            const cur = (prev.nomo_autopilot_tools ?? []) as string[]
            const next = cur.includes(name) ? cur.filter(n => n !== name) : [...cur, name]
            return { ...prev, nomo_autopilot_tools: next }
          })
        }
        return (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-1">
              <BrainCircuit className="h-4 w-4 text-primary" />
              <h2 className="font-medium">Nomo copilot</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Nomo is the in-app chat assistant (⌘J). It can answer questions about
              your pipeline and queue / approve / move work through tool calls.
            </p>

            <div className="flex items-center gap-3 mb-5">
              <Switch checked={enabled} onCheckedChange={v => setField('nomo_enabled', v)} />
              <Label className="font-normal">Nomo enabled</Label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              {(['chat-only', 'approval', 'autopilot'] as const).map(m => {
                const active = mode === m
                const titles = {
                  'chat-only': 'Chat only',
                  'approval':  'Approval (recommended)',
                  'autopilot': 'Autopilot',
                }
                const descs = {
                  'chat-only': 'Read tools only. Nomo never writes — best for new operators.',
                  'approval':  'Reads run freely. Writes propose and wait for your Approve click.',
                  'autopilot': 'Reads + tools in the allowlist below run unattended. Other writes still pause.',
                }
                return (
                  <button
                    key={m}
                    onClick={() => setField('nomo_mode', m)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                    }`}
                  >
                    <div className={`text-sm font-medium ${active ? 'text-primary' : 'text-foreground'}`}>{titles[m]}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{descs[m]}</div>
                  </button>
                )
              })}
            </div>

            <div className="bg-card border border-border rounded-lg p-4 shadow-sm mb-5">
              <p className="text-sm font-medium mb-1">Autopilot allowlist</p>
              <p className="text-[11px] text-muted-foreground mb-3">
                Tools that may run without prompting when the mode is set to <em>Autopilot</em>.
                Read tools are safe-by-default. Be conservative with writes —
                {' '}<span className="font-mono">enqueue_agent</span> and{' '}<span className="font-mono">assign_lead</span> have the largest blast radius.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {NOMO_TOOL_OPTIONS.map(opt => {
                  const on = allowlist.includes(opt.name)
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      onClick={() => toggleTool(opt.name)}
                      disabled={!isAutopilot}
                      className={`flex items-center justify-between text-left text-xs px-3 py-2 rounded border transition-colors ${
                        !isAutopilot
                          ? 'border-border bg-muted/30 text-muted-foreground cursor-not-allowed'
                          : on
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                            : opt.danger
                              ? 'border-red-200 bg-red-50/40 hover:bg-red-50 text-red-900'
                              : 'border-border hover:bg-muted text-foreground'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-mono">{opt.name}</span>
                        <span className="text-[10px] opacity-70">{opt.label}{opt.write ? ' · write' : ''}</span>
                      </div>
                      <span className={`w-3 h-3 rounded-full border ${on ? 'bg-emerald-600 border-emerald-600' : 'border-border'}`} />
                    </button>
                  )
                })}
              </div>
              {!isAutopilot && (
                <p className="text-[11px] text-muted-foreground mt-3">
                  Switch mode to <em>Autopilot</em> to edit the allowlist.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5 mb-5">
              <Label>System prompt addition (optional)</Label>
              <textarea
                className="text-sm rounded-md border border-input bg-background px-3 py-2 font-mono"
                rows={4}
                value={systemPrompt}
                onChange={e => setField('nomo_system_prompt', e.target.value)}
                placeholder={`e.g. "Always reply in English. Always cite the lead's company name. Don't suggest meetings before 10am ET."`}
              />
              <p className="text-[11px] text-muted-foreground">
                Appended to Nomo's base persona. Useful for style preferences or business rules.
              </p>
            </div>

            <Button onClick={() => void saveAll()} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
            </Button>
          </section>
        )
      })()}

      {activeTab === 'smtp' && <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="h-4 w-4 text-primary" />
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
          <div className={`flex items-center gap-2 text-sm p-3 rounded mb-4 ${smtpTestResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {smtpTestResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {smtpTestResult.message}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={() => void saveAll()} disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings</Button>
          <Button variant="outline" onClick={testSmtp} disabled={testingSmtp || !settings.smtp_host || !settings.smtp_username} className="gap-2">{testingSmtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Test SMTP</Button>
        </div>
      </section>}

      {/* ── Inbound mail (IMAP) ─────────────────────────────────── */}
      {activeTab === 'imap' && <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <Inbox className="h-4 w-4 text-primary" />
          <h2 className="font-medium">IMAP (inbound mail → Inbox)</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          The inbox-puller container reads new messages from this mailbox and writes them to the CRM Inbox. Password is stored in <code>crm_provider_credentials</code> with provider = <code>imap</code>.
        </p>

        <div className="flex items-center gap-2 mb-5">
          <Switch checked={settings.imap_enabled} onCheckedChange={v => setField('imap_enabled', v)} />
          <Label className="font-normal">Enable IMAP polling</Label>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-1.5"><Label>IMAP Host</Label><Input value={settings.imap_host} onChange={e => setField('imap_host', e.target.value)} placeholder="imap.gmail.com" /></div>
          <div className="flex flex-col gap-1.5"><Label>Port</Label><Input value={settings.imap_port} onChange={e => setField('imap_port', e.target.value)} placeholder="993" /></div>
          <div className="flex flex-col gap-1.5"><Label>Username</Label><Input value={settings.imap_username} onChange={e => setField('imap_username', e.target.value)} placeholder="hi@imbaproduction.com" /></div>
          <div className="flex flex-col gap-1.5">
            <Label>Password / App password</Label>
            <Input
              type="password"
              value={secretValues['imap_api_key'] ?? ''}
              onChange={e => setSecretValues(prev => ({ ...prev, imap_api_key: e.target.value }))}
              placeholder={providerStatuses['imap'] ? '•••••••• (Set)' : 'Enter IMAP password'}
            />
            <p className="text-[10px] text-muted-foreground">{providerStatuses['imap'] ? 'Password configured. Enter a new one to replace it.' : 'Password missing.'}</p>
          </div>
          <div className="flex flex-col gap-1.5"><Label>Folder</Label><Input value={settings.imap_folder} onChange={e => setField('imap_folder', e.target.value)} placeholder="INBOX" /></div>
          <div className="flex flex-col gap-1.5"><Label>Poll interval (s)</Label><Input type="number" value={settings.imap_poll_seconds} onChange={e => setField('imap_poll_seconds', parseInt(e.target.value || '60', 10))} placeholder="60" /></div>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <Switch checked={settings.imap_secure} onCheckedChange={v => setField('imap_secure', v)} />
          <Label className="font-normal">Use SSL/TLS (port 993)</Label>
        </div>

        <PollStatus
          enabled={settings.imap_enabled}
          lastSuccessAt={settings.imap_last_success_at}
          lastError={settings.imap_last_error}
          lastErrorAt={settings.imap_last_error_at}
          label="IMAP"
        />

        {imapTestResult && (
          <div className={`mt-3 flex items-center gap-2 text-sm p-3 rounded ${imapTestResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {imapTestResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {imapTestResult.message}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <Button onClick={() => void saveAll()} disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings</Button>
          <Button variant="outline" onClick={testImap} disabled={testingImap || !settings.imap_host || !settings.imap_username} className="gap-2">{testingImap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Test IMAP</Button>
        </div>
      </section>}

      {/* ── Inbound mail (POP3 — fallback for legacy hosts) ──────── */}
      {activeTab === 'pop3' && <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-medium">POP3 (inbound mail — fallback)</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Use only if your host doesn't support IMAP. POP3 has no folders and no per-message flags — read-state is tracked locally by UIDL. Password lives in <code>crm_provider_credentials</code> with provider = <code>pop3</code>.
        </p>

        <div className="flex items-center gap-2 mb-5">
          <Switch checked={settings.pop3_enabled} onCheckedChange={v => setField('pop3_enabled', v)} />
          <Label className="font-normal">Enable POP3 polling</Label>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-1.5"><Label>POP3 Host</Label><Input value={settings.pop3_host} onChange={e => setField('pop3_host', e.target.value)} placeholder="pop.example.com" /></div>
          <div className="flex flex-col gap-1.5"><Label>Port</Label><Input value={settings.pop3_port} onChange={e => setField('pop3_port', e.target.value)} placeholder="995" /></div>
          <div className="flex flex-col gap-1.5"><Label>Username</Label><Input value={settings.pop3_username} onChange={e => setField('pop3_username', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              value={secretValues['pop3_api_key'] ?? ''}
              onChange={e => setSecretValues(prev => ({ ...prev, pop3_api_key: e.target.value }))}
              placeholder={providerStatuses['pop3'] ? '•••••••• (Set)' : 'Enter POP3 password'}
            />
            <p className="text-[10px] text-muted-foreground">{providerStatuses['pop3'] ? 'Password configured.' : 'Password missing.'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Switch checked={settings.pop3_secure} onCheckedChange={v => setField('pop3_secure', v)} />
            <Label className="font-normal">Use SSL/TLS</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={settings.pop3_leave_on_server} onCheckedChange={v => setField('pop3_leave_on_server', v)} />
            <Label className="font-normal">Leave messages on server</Label>
          </div>
        </div>

        <PollStatus
          enabled={settings.pop3_enabled}
          lastSuccessAt={settings.pop3_last_success_at}
          lastError={settings.pop3_last_error}
          lastErrorAt={settings.pop3_last_error_at}
          label="POP3"
        />

        {pop3TestResult && (
          <div className={`mt-3 flex items-center gap-2 text-sm p-3 rounded ${pop3TestResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {pop3TestResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {pop3TestResult.message}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <Button onClick={() => void saveAll()} disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings</Button>
          <Button variant="outline" onClick={testPop3} disabled={testingPop3 || !settings.pop3_host || !settings.pop3_username} className="gap-2">{testingPop3 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Test POP3</Button>
        </div>
      </section>}

      {activeTab === 'caps' && <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <BrainCircuit className="h-4 w-4 text-primary" />
          <h2 className="font-medium">AI Governance & Cost Controls</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Set monthly spend limits and fallback behaviors for all AI operations across the CRM.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div className="flex flex-col gap-1.5">
            <Label>Monthly Cap (USD)</Label>
            <Input 
              type="number" 
              min="0" 
              step="1"
              value={(settings.ai_monthly_cap_cents || 0) / 100} 
              onChange={e => setField('ai_monthly_cap_cents', Math.round((Number(e.target.value) || 0) * 100))} 
            />
            <p className="text-[10px] text-muted-foreground">Hard limit for the organization</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Soft Cap Warning (USD)</Label>
            <Input 
              type="number" 
              min="0" 
              step="1"
              value={(settings.ai_soft_cap_cents || 0) / 100} 
              onChange={e => setField('ai_soft_cap_cents', Math.round((Number(e.target.value) || 0) * 100))} 
            />
            <p className="text-[10px] text-muted-foreground">Trigger warnings when reached</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>When cap is hit</Label>
            <Select value={settings.ai_cap_action || 'block'} onValueChange={(v: 'block' | 'downgrade' | 'require_approval') => setField('ai_cap_action', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="block">Block all AI actions</SelectItem>
                <SelectItem value="downgrade">Downgrade to cheapest model</SelectItem>
                <SelectItem value="require_approval">Require manual approval</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Action taken on hard cap</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void saveAll()} disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings</Button>
        </div>
      </section>}

      {activeTab === 'company' && <section className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Company Profile</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Injected into CRM prompts for lead search, outreach and proposals.</p>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5"><Label>Company name</Label><Input value={settings.company_name} onChange={e => setField('company_name', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Description</Label><Input value={settings.company_description} onChange={e => setField('company_description', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Unique selling point</Label><Input value={settings.usp} onChange={e => setField('usp', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Meeting scheduling URL</Label><Input value={settings.scheduling_url} onChange={e => setField('scheduling_url', e.target.value)} placeholder="https://cal.com/your-name" /></div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={() => void saveAll()} disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings</Button>
        </div>
      </section>}
        </div>
      </div>
    </div>
  )
}
