import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@imba/shared/supabase'
import { DEFAULT_CRM_RUNTIME_SETTINGS, getCRMRuntimeSettings, type AIProvider, type CRMRuntimeSettings } from '@imba/shared/lib/ai'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Label } from '@imba/shared/ui/label'
import { Switch } from '@imba/shared/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@imba/shared/ui/select'
import { Textarea } from '@imba/shared/ui/textarea'
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

type SettingsTab = 'ai' | 'nomo' | 'integrations' | 'icp' | 'smtp' | 'imap' | 'pop3' | 'caps' | 'company'

const TABS: Array<{ id: SettingsTab; label: string; description: string }> = [
  { id: 'ai',           label: 'AI providers',  description: 'Models, keys, routing and outreach tone' },
  { id: 'nomo',         label: 'Nomo copilot',  description: 'Mode, autopilot allowlist, system prompt' },
  { id: 'integrations', label: 'Integrations',  description: 'Apify, Hunter, Apollo, Browserbase, Cal, Loom…' },
  { id: 'icp',          label: 'ICP rules',     description: 'Define what a fit-100 lead looks like' },
  { id: 'smtp',         label: 'Outbound mail', description: 'SMTP delivery for outreach + replies' },
  { id: 'imap',         label: 'IMAP inbox',    description: 'Pull messages into the CRM via IMAP' },
  { id: 'pop3',         label: 'POP3 inbox',    description: 'Alternative inbound mail polling' },
  { id: 'caps',         label: 'Cost & limits', description: 'Monthly AI spend ceiling + cap action' },
  { id: 'company',      label: 'Company',       description: 'Brand context the AI uses in prompts' },
]

// Non-LLM providers — keys live in crm_provider_credentials and are
// consumed by the worker (lead-finder agent, Apify channel, contact-form
// fill, Cal.com booking, Loom email embed, …). The existing saveAll
// loop in this file picks up any secretValues entry whose key ends in
// `_api_key`, strips that suffix, and POSTs to set_provider_credential.
const INTEGRATION_PROVIDERS: Array<{
  provider: string
  label: string
  hint: string
  placeholder: string
  docs?: string
  needsCookie?: boolean   // LinkedIn stores a session cookie, not an API key
}> = [
  { provider: 'apify',       label: 'Apify',        hint: 'Lead-finder agent + LinkedIn DM channel. Get the token from apify.com → Settings → Integrations.', placeholder: 'apify_api_xxxxxxxxxxxxxxxx',    docs: 'https://apify.com/settings/integrations' },
  { provider: 'hunter',      label: 'Hunter.io',    hint: 'Email finder + verifier. Used by lead-enricher.',                                                  placeholder: 'a1b2c3d4e5...',                docs: 'https://hunter.io/api-keys' },
  { provider: 'apollo',      label: 'Apollo.io',    hint: 'Person enrichment (title, phone, seniority). Used by lead-enricher.',                              placeholder: 'aPoLLo_xxxxxxxxxxxx',          docs: 'https://app.apollo.io/#/settings/integrations/api' },
  { provider: 'browserbase', label: 'Browserbase',  hint: 'Headless browser + Stagehand for contact-form fill / DOM extraction.',                             placeholder: 'bb_xxxxxxxxxxxxxxxx',          docs: 'https://browserbase.com/dashboard/settings' },
  { provider: 'cal',         label: 'Cal.com',      hint: 'Booking link slot finder + calendar webhook. Personal access token from cal.com → Settings → Developer.', placeholder: 'cal_xxxxxxxxxxxxxxxx',  docs: 'https://app.cal.com/settings/developer/api-keys' },
  { provider: 'loom',        label: 'Loom',         hint: 'Personalised video embed in outreach emails (optional — paste any token; we use it as an attribution flag).', placeholder: '(any string)' },
  { provider: 'linkedin',    label: 'LinkedIn',     hint: 'LinkedIn session cookie (li_at) — used by the LinkedIn DM channel via Apify. NOT an OAuth token.',  placeholder: 'AQEDA...', needsCookie: true },
  { provider: 'tavily',      label: 'Tavily',       hint: 'Real-time web search for AI agents (raw JSON). Optional — Perplexity covers most needs.',           placeholder: 'tvly-xxxxxxxxxxxx',           docs: 'https://app.tavily.com/' },
  { provider: 'mailreach',   label: 'MailReach',    hint: 'Email warmup-as-a-service. Lifts inbox placement on cold outreach.',                                placeholder: 'mr_xxxxxxxxxxxx',             docs: 'https://app.mailreach.co/users/account' },
  { provider: 'recording',   label: 'Recording webhook secret', hint: 'HMAC-SHA256 secret for /api/webhooks/recording. Set the same secret on Daily.co / Whereby / Cal.com when configuring the post-call webhook.', placeholder: '(any random 32+ chars)' },
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

            {/* Agent kill-switches (per-kind enable/disable) */}
            <div className="border-t border-border pt-5 mb-5">
              <h3 className="font-medium text-sm mb-1">Agent kill-switches</h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                Disable specific agent kinds. Queued jobs for a disabled kind are auto-cancelled with a clear error so the operator sees what happened.
              </p>
              <AgentKillSwitchList
                disabled={settings.agent_kinds_disabled ?? []}
                onChange={(next) => setField('agent_kinds_disabled', next)}
              />
            </div>

            {/* Approval timeout */}
            <div className="flex items-center gap-3 mb-5">
              <Label className="text-sm">Approval timeout</Label>
              <Input
                type="number"
                min={5}
                max={10080}
                value={settings.agent_approval_timeout_minutes ?? 60}
                onChange={e => {
                  const n = parseInt(e.target.value, 10)
                  setField('agent_approval_timeout_minutes', isNaN(n) ? 60 : Math.max(5, Math.min(10080, n)))
                }}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">minutes — how long an awaiting-approval step waits before auto-rejecting. Min 5, max 10080 (a week).</span>
            </div>

            <Button onClick={() => void saveAll()} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
            </Button>
          </section>
        )
      })()}

      {activeTab === 'integrations' && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="font-medium">Integrations</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Keys for the worker-side integrations. Each one is consumed by a specific
            agent or channel — only configure what you actually use.
            All keys live in <code>crm_provider_credentials</code> and never round-trip to the browser.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
            {INTEGRATION_PROVIDERS.map(p => {
              const secretKey = `${p.provider}_api_key`
              const isSet = !!providerStatuses[p.provider]
              const visible = !!visibleSecrets[secretKey]
              const value = secretValues[secretKey] ?? ''
              return (
                <div key={p.provider} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium">{p.label}</p>
                        {isSet
                          ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">configured</span>
                          : <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">not set</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{p.hint}</p>
                    </div>
                    {p.docs && (
                      <a href={p.docs} target="_blank" rel="noopener noreferrer"
                         className="text-[11px] text-primary hover:underline flex-shrink-0">
                        Get key ↗
                      </a>
                    )}
                  </div>
                  <div className="relative mt-2">
                    <Input
                      type={visible ? 'text' : 'password'}
                      value={value}
                      onChange={e => setSecretValues(prev => ({ ...prev, [secretKey]: e.target.value }))}
                      className="pr-10 font-mono text-xs"
                      placeholder={isSet ? '•••••••• (rotate by entering a new value)' : (p.needsCookie ? `Paste ${p.label} cookie` : `Paste ${p.label} key`)}
                    />
                    <button
                      type="button"
                      onClick={() => setVisibleSecrets(prev => ({ ...prev, [secretKey]: !prev[secretKey] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {p.needsCookie && (
                    <p className="text-[10px] text-amber-700 mt-1.5">
                      ⚠ LinkedIn rotates session cookies aggressively. Re-paste if your DMs start failing.
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <Button onClick={() => void saveAll()} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save integration keys
          </Button>
        </section>
      )}

      {activeTab === 'icp' && <IcpRulesSection />}

      {activeTab === 'smtp' && <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="h-4 w-4 text-primary" />
          <h2 className="font-medium">SMTP Configuration</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Pick a preset (auto-fills host/port/SSL) or fill manually for a custom server.
        </p>
        <SmtpPresetPicker
          onApply={(p) => {
            setField('smtp_host' as never, p.host as never)
            setField('smtp_port' as never, p.port as never)
            setField('smtp_secure' as never, p.secure as never)
            toast.success(`Applied ${p.label} preset — fill in username + app password.`)
          }}
        />
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

        {/* ── Email signature ─────────────────────────────────────────── */}
        <div className="border-t border-border pt-5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-medium text-sm">Email signature</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Appended to every outbound email below an RFC 3676 <code>-- </code> delimiter so clients can fold it.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.email_signature_enabled ?? true}
                onCheckedChange={v => setField('email_signature_enabled', v)}
              />
              <Label className="font-normal text-xs">Append on every send</Label>
            </div>
          </div>
          <Textarea
            value={settings.email_signature ?? ''}
            onChange={e => setField('email_signature', e.target.value)}
            rows={5}
            placeholder={`Marko Tiosavljevic\nImba Marketing\nhttps://imbaproduction.com\n+381 …`}
            className="font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Plain text. The worker auto-detects + skips when an outbound body already includes the first 30 chars (e.g. AI-generated drafts that bake in a sign-off).
          </p>
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

        <SenderHealthCard
          inboxHealth={(settings.smtp_inbox_health as SmtpInboxHealth | null) ?? null}
          autoThrottle={settings.smtp_auto_throttle ?? true}
          maxBouncePct={settings.smtp_max_bounce_rate_pct ?? 5}
          onAutoThrottleChange={v => setField('smtp_auto_throttle', v)}
          onMaxBouncePctChange={v => setField('smtp_max_bounce_rate_pct', v)}
        />
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

        <div className="flex items-center gap-2 mb-2">
          <Switch checked={settings.imap_enabled} onCheckedChange={v => setField('imap_enabled', v)} />
          <Label className="font-normal">Enable IMAP polling</Label>
        </div>
        <LoopHealthChip
          enabled={!!settings.imap_enabled}
          lastSyncedAt={settings.imap_last_synced_at ?? settings.imap_last_success_at ?? null}
          lastErrorAt={settings.imap_last_error_at ?? null}
          lastError={settings.imap_last_error ?? null}
        />

        <div className="grid grid-cols-2 gap-4 mt-4 mb-4">
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

        <div className="flex items-center gap-2 mb-2">
          <Switch checked={settings.pop3_enabled} onCheckedChange={v => setField('pop3_enabled', v)} />
          <Label className="font-normal">Enable POP3 polling</Label>
        </div>
        <LoopHealthChip
          enabled={!!settings.pop3_enabled}
          lastSyncedAt={settings.pop3_last_synced_at ?? settings.pop3_last_success_at ?? null}
          lastErrorAt={settings.pop3_last_error_at ?? null}
          lastError={settings.pop3_last_error ?? null}
        />

        <div className="grid grid-cols-2 gap-4 mt-4 mb-4">
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

// ── Phase 10.5: deliverability card ──────────────────────────────────
interface SmtpInboxHealth {
  inboxes?: Array<{
    email: string
    status: string
    warmup_score?: number | null
    sender_score?: number | null
    deliverability?: number | null
    placement?: { inbox_pct: number; promotions_pct: number; spam_pct: number; measured_at: string } | null
  }>
  fetched_at?: string
}

interface SenderHealthCardProps {
  inboxHealth: SmtpInboxHealth | null
  autoThrottle: boolean
  maxBouncePct: number
  onAutoThrottleChange: (v: boolean) => void
  onMaxBouncePctChange: (v: number) => void
}

function SenderHealthCard({
  inboxHealth,
  autoThrottle,
  maxBouncePct,
  onAutoThrottleChange,
  onMaxBouncePctChange,
}: SenderHealthCardProps) {
  const [domainStats, setDomainStats] = useState<Array<{
    sender_domain: string
    total_30d: number
    sent_30d: number
    opened_30d: number
    replied_30d: number
    bounced_30d: number
    complained_30d: number
  }>>([])

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('crm_sender_health').select('*')
      setDomainStats((data as typeof domainStats | null) ?? [])
    })()
  }, [])

  const inboxes = inboxHealth?.inboxes ?? []

  // Current throttle state: if any sender domain is over the threshold,
  // the worker will skip its next outbound batch. Surface that here so
  // the operator knows mid-day why nothing is sending.
  const overCeiling = domainStats.some(d => d.sent_30d >= 20 && (d.bounced_30d / d.sent_30d) > maxBouncePct / 100)
  const throttledNow = autoThrottle && overCeiling

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-center gap-2 mb-1">
        <Zap className="h-4 w-4 text-primary" />
        <h3 className="font-medium">Sender health</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Deliverability matters more than features in 2026. Configure MailReach in Integrations and the worker
        refreshes warmup + inbox-placement every 12h.
      </p>

      {/* Throttle controls + current state */}
      {throttledNow && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 flex items-start gap-2">
          <Zap className="h-4 w-4 text-red-700 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-red-900">
            <strong>Auto-throttled — no outbound sending right now.</strong> Your 30-day bounce rate is over the
            configured ceiling ({maxBouncePct}%). Pause outreach, audit the bounce reasons below, then re-enable.
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4 mb-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Switch checked={autoThrottle} onCheckedChange={onAutoThrottleChange} />
          <Label className="font-normal text-sm cursor-pointer" onClick={() => onAutoThrottleChange(!autoThrottle)}>
            Auto-throttle outbound when bounce rate is over
          </Label>
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            max={20}
            step="1"
            value={maxBouncePct}
            onChange={e => onMaxBouncePctChange(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 5)))}
            className="w-16 text-center"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <p className="text-[11px] text-muted-foreground basis-full">
          Healthy = ≤2%. Marketing-grade = ≤5%. Anything above 5% degrades sender reputation rapidly.
        </p>
      </div>

      {/* MailReach panel */}
      <div className="bg-card border border-border rounded-lg p-4 mb-3">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
          MailReach warmup {inboxHealth?.fetched_at && <span className="opacity-60">· refreshed {new Date(inboxHealth.fetched_at).toLocaleString()}</span>}
        </p>
        {inboxes.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No MailReach data yet. Add a MailReach key under Integrations and enroll your outbound inbox
            (apps.mailreach.co → Email accounts).
          </p>
        ) : (
          <div className="space-y-3">
            {inboxes.map(i => (
              <div key={i.email} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="font-mono">{i.email}</p>
                  <p className="text-[10px] text-muted-foreground">{i.status}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Warmup score</p>
                  <p className="font-mono font-bold text-base">{i.warmup_score ?? '–'}/100</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Sender score</p>
                  <p className="font-mono font-bold text-base">{i.sender_score ?? '–'}</p>
                </div>
                {i.placement && (
                  <div className="md:col-span-1">
                    <p className="text-[10px] text-muted-foreground mb-1">Placement</p>
                    <div className="flex h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500" style={{ width: `${i.placement.inbox_pct}%` }} />
                      <div className="bg-amber-500"   style={{ width: `${i.placement.promotions_pct}%` }} />
                      <div className="bg-red-500"     style={{ width: `${i.placement.spam_pct}%` }} />
                    </div>
                    <p className="text-[10px] mt-0.5 text-muted-foreground">
                      {i.placement.inbox_pct}% inbox · {i.placement.promotions_pct}% promo · {i.placement.spam_pct}% spam
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-domain stats from outbox */}
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
          Send + bounce stats (last 30d)
        </p>
        {domainStats.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No outbound send activity yet.</p>
        ) : (
          <div className="space-y-2">
            {domainStats.map(d => {
              const bouncePct   = d.sent_30d > 0 ? (d.bounced_30d / d.sent_30d) * 100 : 0
              const replyPct    = d.sent_30d > 0 ? (d.replied_30d / d.sent_30d) * 100 : 0
              const bounceColor = bouncePct >= 5 ? 'text-red-700' : bouncePct >= 2 ? 'text-amber-700' : 'text-emerald-700'
              return (
                <div key={d.sender_domain} className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
                  <p className="font-mono">{d.sender_domain || '(no domain)'}</p>
                  <p>sent <span className="font-mono font-medium">{d.sent_30d}</span></p>
                  <p>opens <span className="font-mono font-medium">{d.opened_30d}</span></p>
                  <p>replies <span className="font-mono font-medium text-emerald-700">{d.replied_30d}</span> ({replyPct.toFixed(1)}%)</p>
                  <p>bounces <span className={`font-mono font-medium ${bounceColor}`}>{d.bounced_30d}</span> ({bouncePct.toFixed(1)}%)</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}


// ── ICP rules section (moved out of Lead Finder so it lives where all
// other rules live: Settings. Drives fit_score via the lead-scorer
// agent's daily run).
interface IcpRulesShape {
  industries?: string[]
  countries?: string[]
  titles_must_match?: string[]
  tech_must_match?: string[]
  tech_block?: string[]
  employee_min?: number
  employee_max?: number
}

function IcpRulesSection() {
  const [rules, setRules] = useState<IcpRulesShape>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { void load() }, [])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('crm_runtime_settings').select('icp_rules').eq('id', 1).maybeSingle()
    setRules(((data as { icp_rules?: IcpRulesShape } | null)?.icp_rules) ?? {})
    setLoading(false)
  }
  async function save() {
    setSaving(true)
    const { error } = await supabase.from('crm_runtime_settings').update({ icp_rules: rules }).eq('id', 1)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('ICP rules saved — fit_score will recompute on next lead-scorer run.')
  }
  const toCsv = (a?: string[]) => (a ?? []).join(', ')
  const fromCsv = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)
  const summary = useMemo(() => {
    const b: string[] = []
    if (rules.industries?.length) b.push(`${rules.industries.length} industries`)
    if (rules.titles_must_match?.length) b.push(`${rules.titles_must_match.length} titles`)
    if (rules.countries?.length) b.push(`${rules.countries.length} countries`)
    if (rules.tech_must_match?.length) b.push(`${rules.tech_must_match.length} tech keywords`)
    if (rules.tech_block?.length) b.push(`${rules.tech_block.length} tech blocked`)
    if (rules.employee_min || rules.employee_max) b.push(`size ${rules.employee_min ?? 0}-${rules.employee_max ?? '∞'}`)
    return b.length ? b.join(' · ') : 'No rules yet — every lead scores 50/100 by default.'
  }, [rules])
  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  return (
    <section className="mb-10 space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Zap className="h-4 w-4 text-primary" />
        <h2 className="font-medium">ICP rules</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        These rules drive <strong>fit_score</strong> (0-100). The Pipeline sorts by fit × intent so the lead the rep should call next floats to the top. Lead Finder also pulls these for its niche + country defaults.
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 text-amber-700 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-amber-900 font-mono">{summary}</div>
      </div>
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Target industries</Label>
            <Input value={toCsv(rules.industries)} onChange={e => setRules(r => ({ ...r, industries: fromCsv(e.target.value) }))} placeholder="saas, ecommerce, real estate" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Target countries</Label>
            <Input value={toCsv(rules.countries)} onChange={e => setRules(r => ({ ...r, countries: fromCsv(e.target.value) }))} placeholder="US, UK, DE, RS" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Target titles</Label>
            <Input value={toCsv(rules.titles_must_match)} onChange={e => setRules(r => ({ ...r, titles_must_match: fromCsv(e.target.value) }))} placeholder="founder, ceo, cmo, marketing, head, vp" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tech in stack (boost)</Label>
            <Input value={toCsv(rules.tech_must_match)} onChange={e => setRules(r => ({ ...r, tech_must_match: fromCsv(e.target.value) }))} placeholder="shopify, hubspot, segment" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tech blocklist</Label>
            <Input value={toCsv(rules.tech_block)} onChange={e => setRules(r => ({ ...r, tech_block: fromCsv(e.target.value) }))} placeholder="wordpress.com, wix" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Employee count range</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} value={rules.employee_min ?? 0} onChange={e => setRules(r => ({ ...r, employee_min: Number(e.target.value) || 0 }))} placeholder="min" />
              <span className="text-muted-foreground">–</span>
              <Input type="number" min={0} value={rules.employee_max ?? 5000} onChange={e => setRules(r => ({ ...r, employee_max: Number(e.target.value) || 0 }))} placeholder="max" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save ICP rules
          </Button>
          <Button variant="outline" onClick={load} disabled={saving} size="sm">Revert</Button>
        </div>
      </div>
    </section>
  )
}

// ── SMTP provider presets — pick a known provider, auto-fill host/port/SSL.
// Operator only types username + app password.
const SMTP_PRESETS: Array<{ label: string; host: string; port: string; secure: boolean; hint: string }> = [
  { label: 'Gmail / Workspace', host: 'smtp.gmail.com',         port: '587', secure: false, hint: 'Use an app password (Google Account → Security → 2-step verification → App passwords).' },
  { label: 'Outlook / Office 365', host: 'smtp.office365.com',  port: '587', secure: false, hint: 'Microsoft 365 SMTP AUTH may be disabled by default — enable in admin centre.' },
  { label: 'Zoho Mail',         host: 'smtp.zoho.com',          port: '587', secure: false, hint: 'Generate an app-specific password under Zoho account → Security.' },
  { label: 'Fastmail',          host: 'smtp.fastmail.com',      port: '465', secure: true,  hint: 'Settings → Password & security → App passwords → "Mail (SMTP)".' },
  { label: 'iCloud',            host: 'smtp.mail.me.com',       port: '587', secure: false, hint: 'App-specific password from appleid.apple.com.' },
  { label: 'Mailgun',           host: 'smtp.mailgun.org',       port: '587', secure: false, hint: 'Use SMTP credentials from Sending → Domain settings.' },
  { label: 'Postmark',          host: 'smtp.postmarkapp.com',   port: '587', secure: false, hint: 'Username + password are both your Postmark Server Token.' },
  { label: 'SendGrid',          host: 'smtp.sendgrid.net',      port: '587', secure: false, hint: 'Username is the literal string "apikey"; password is your SendGrid API key.' },
  { label: 'Brevo (Sendinblue)',host: 'smtp-relay.brevo.com',   port: '587', secure: false, hint: 'SMTP key, not the main API key — generate under SMTP & API.' },
  { label: 'Resend',            host: 'smtp.resend.com',        port: '587', secure: false, hint: 'Username = "resend"; password = your Resend API key.' },
  { label: 'Plesk (self-hosted)', host: 'localhost',            port: '25',  secure: false, hint: 'If you run mail on the same box. Plain auth, no encryption needed for localhost.' },
]

function SmtpPresetPicker({ onApply }: { onApply: (p: typeof SMTP_PRESETS[number]) => void }) {
  const [picked, setPicked] = useState<string>('')
  const preset = SMTP_PRESETS.find(p => p.label === picked)
  return (
    <div className="bg-card border border-border rounded-lg p-3 mb-5 flex flex-wrap items-start gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-[260px]">
        <Label className="text-xs whitespace-nowrap text-muted-foreground">Provider preset</Label>
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Pick a provider…" /></SelectTrigger>
          <SelectContent>
            {SMTP_PRESETS.map(p => <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!preset} onClick={() => preset && onApply(preset)} className="h-8 text-xs gap-1">
          Apply
        </Button>
      </div>
      {preset && (
        <p className="text-[11px] text-muted-foreground basis-full">
          <strong>Host:</strong> <code>{preset.host}</code> · <strong>Port:</strong> <code>{preset.port}</code> · <strong>SSL:</strong> <code>{preset.secure ? 'on' : 'off (STARTTLS)'}</code> — {preset.hint}
        </p>
      )}
    </div>
  )
}

// ── Per-loop health chip ─────────────────────────────────────────────
// Shows operator-readable status next to the IMAP/POP3 enable toggle:
//   green  "✓ Last poll 2m ago"
//   red    "✗ Last error 5m ago: 535 auth failed"
//   grey   "disabled"
function fmtAge(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`
  return `${Math.floor(ms / 86400_000)}d ago`
}
function LoopHealthChip({
  enabled, lastSyncedAt, lastErrorAt, lastError,
}: {
  enabled: boolean
  lastSyncedAt: string | null
  lastErrorAt: string | null
  lastError: string | null
}) {
  if (!enabled) {
    return <span className="text-[10px] font-mono text-muted-foreground">disabled</span>
  }
  // Error fresher than success → red
  const successMs = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0
  const errorMs   = lastErrorAt   ? new Date(lastErrorAt).getTime()   : 0
  const recentError = errorMs > successMs && lastError
  if (recentError) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-50 border border-red-200 text-[11px] text-red-800" title={lastError}>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Last error {fmtAge(lastErrorAt)}: {lastError.slice(0, 70)}{lastError.length > 70 ? '…' : ''}
      </span>
    )
  }
  if (lastSyncedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Last poll {fmtAge(lastSyncedAt)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/50 border border-border text-[11px] text-muted-foreground">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
      Enabled — waiting for first poll
    </span>
  )
}

// ── Per-agent-kind kill-switch list ──────────────────────────────────
// Shows one toggle per known agent kind. Off = the worker auto-cancels
// any queued job for that kind with a clear error message.
const KNOWN_AGENT_KINDS = [
  'lead-finder', 'lead-enricher', 'lead-scorer',
  'outreach-drafter', 'inbox-replier', 'meeting-booker',
  'deal-health-scorer', 'call-analyzer',
  'account-researcher', 'objection-tracker',
  'proposal-writer', 'prospect-pipeline',
] as const

function AgentKillSwitchList({
  disabled, onChange,
}: { disabled: string[]; onChange: (next: string[]) => void }) {
  const disabledSet = new Set(disabled)
  function toggle(kind: string) {
    const next = new Set(disabledSet)
    if (next.has(kind)) next.delete(kind)
    else next.add(kind)
    onChange(Array.from(next))
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {KNOWN_AGENT_KINDS.map(k => {
        const off = disabledSet.has(k)
        return (
          <label
            key={k}
            className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs cursor-pointer transition-colors ${
              off
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-card border-border hover:bg-muted/40'
            }`}
          >
            <input
              type="checkbox"
              checked={!off}
              onChange={() => toggle(k)}
              className="accent-primary"
            />
            <span className="font-mono">{k}</span>
            {off && <span className="ml-auto text-[10px] uppercase tracking-wider text-red-700">disabled</span>}
          </label>
        )
      })}
    </div>
  )
}
