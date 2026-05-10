// /api/ai/route — server-side AI provider proxy.
//
// The shared SPA helper `callAI()` posts the same body shape to
// /api/ai/route that the standalone model-router accepts:
//
//   { task: { type: 'reasoning', messages: [...] }, providerConfigs?, policyOverride? }
//
// expecting:
//   { ok: true, data: { content }, event: { provider, model, tokensIn, tokensOut, costCents } }
//
// We've never deployed the standalone model-router service, so the SPA
// has been 502-ing on every callAI call (Lead Finder, scoring, drafter,
// etc.). This module gives the worker that endpoint inline — same
// provider keys, same DB, no extra container.
//
// Supported providers: anthropic / openai / openrouter (the three the
// SPA actively routes). gemini, perplexity, ollama can be added when
// needed.

import type { Hono } from 'hono'
import { supabase } from './supabase.js'

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
interface RouteBody {
  task?: {
    type?: string
    messages?: ChatMessage[]
    systemPrompt?: string
  }
  providerConfigs?: Record<string, { modelId?: string; temperature?: number }>
  policyOverride?: { reasoning?: Array<{ provider: string; modelId: string }> }
}

interface RouteResult {
  ok: boolean
  data?: { content: string }
  event?: {
    provider: string
    model: string
    tokensIn?: number
    tokensOut?: number
    costCents?: number
  }
  error?: { code: string; message: string }
}

// Cents per million tokens. Rough — keep in sync with model-router/cost.ts.
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-sonnet-4-20250514':  { in: 300,  out: 1500 },
  'claude-sonnet-4':           { in: 300,  out: 1500 },
  'claude-3-haiku-20240307':   { in: 25,   out: 125  },
  'gpt-4o-mini':               { in: 15,   out: 60   },
  'gpt-4o':                    { in: 250,  out: 1000 },
}
function estimateCostCents(model: string, tokensIn: number, tokensOut: number): number {
  const m = Object.keys(PRICING).find(k => model.includes(k))
  if (!m) return 0
  const p = PRICING[m]
  return Math.ceil((tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out)
}

async function getKey(provider: string): Promise<string | null> {
  const { data } = await supabase
    .from('crm_provider_credentials')
    .select('api_key')
    .eq('provider', provider)
    .maybeSingle()
  return (data as { api_key: string | null } | null)?.api_key ?? null
}

async function getRuntime() {
  const { data } = await supabase
    .from('crm_runtime_settings')
    .select('active_ai_provider, active_ai_model, anthropic_model, openai_model, openrouter_model, anthropic_temperature')
    .eq('id', 1)
    .maybeSingle()
  return data as {
    active_ai_provider: string
    active_ai_model: string
    anthropic_model: string
    openai_model: string
    openrouter_model: string
    anthropic_temperature: number | null
  } | null
}

async function callAnthropic(model: string, messages: ChatMessage[], systemPrompt: string | undefined, temperature: number, apiKey: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: messages.filter(m => m.role !== 'system'),
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`anthropic ${res.status}: ${txt.slice(0, 300)}`)
  }
  const json = await res.json() as {
    content?: Array<{ type: string; text: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  return {
    content: json.content?.find(b => b.type === 'text')?.text ?? '',
    tokensIn:  json.usage?.input_tokens  ?? 0,
    tokensOut: json.usage?.output_tokens ?? 0,
  }
}

async function callOpenAICompatible(url: string, model: string, messages: ChatMessage[], systemPrompt: string | undefined, temperature: number, apiKey: string, extraHeaders: Record<string, string> = {}) {
  const msgs: ChatMessage[] = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
  msgs.push(...messages)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify({ model, messages: msgs, temperature }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`${url}: ${res.status}: ${txt.slice(0, 300)}`)
  }
  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  return {
    content: json.choices?.[0]?.message?.content ?? '',
    tokensIn:  json.usage?.prompt_tokens     ?? 0,
    tokensOut: json.usage?.completion_tokens ?? 0,
  }
}

export function mountAiProxy(app: Hono) {
  app.post('/api/ai/route', async c => {
    const body = await c.req.json().catch(() => ({})) as RouteBody
    const messages = body.task?.messages ?? []
    if (!Array.isArray(messages) || messages.length === 0) {
      return c.json<RouteResult>({ ok: false, error: { code: 'INVALID_TASK', message: 'task.messages must be a non-empty array' } }, 400)
    }

    const runtime = await getRuntime()
    if (!runtime) {
      return c.json<RouteResult>({ ok: false, error: { code: 'NO_RUNTIME', message: 'crm_runtime_settings row missing' } }, 500)
    }

    // Resolve provider + model. Caller can override via policyOverride.reasoning[0]
    // or providerConfigs[<provider>].modelId.
    let provider = runtime.active_ai_provider
    let model    = runtime.active_ai_model
    const override = body.policyOverride?.reasoning?.[0]
    if (override?.provider) provider = override.provider
    if (override?.modelId)  model    = override.modelId
    const cfg = provider ? body.providerConfigs?.[provider] : undefined
    if (cfg?.modelId) model = cfg.modelId
    if (!model) {
      const fallback = (runtime as Record<string, string>)[`${provider}_model`]
      if (fallback) model = fallback
    }
    const temperature = cfg?.temperature ?? runtime.anthropic_temperature ?? 0.2

    // Pull system prompt out of the messages array if present (the legacy
    // shape includes it inline as role:'system').
    const sys = messages.find(m => m.role === 'system')?.content ?? body.task?.systemPrompt
    const userMessages = messages.filter(m => m.role !== 'system')

    try {
      let result: { content: string; tokensIn: number; tokensOut: number }
      if (provider === 'anthropic') {
        const apiKey = await getKey('anthropic')
        if (!apiKey) throw new Error('Anthropic API key not configured')
        result = await callAnthropic(model, userMessages, sys, temperature, apiKey)
      } else if (provider === 'openai') {
        const apiKey = await getKey('openai')
        if (!apiKey) throw new Error('OpenAI API key not configured')
        result = await callOpenAICompatible('https://api.openai.com/v1/chat/completions', model, userMessages, sys, temperature, apiKey)
      } else if (provider === 'openrouter') {
        const apiKey = await getKey('openrouter')
        if (!apiKey) throw new Error('OpenRouter API key not configured')
        result = await callOpenAICompatible(
          'https://openrouter.ai/api/v1/chat/completions',
          model || 'anthropic/claude-sonnet-4',
          userMessages,
          sys,
          temperature,
          apiKey,
          { 'HTTP-Referer': 'https://crm.imbaproduction.com', 'X-Title': 'imba.crm' },
        )
      } else {
        return c.json<RouteResult>({
          ok: false,
          error: {
            code: 'UNSUPPORTED_PROVIDER',
            message: `provider "${provider}" not yet supported by the in-worker proxy. Configure anthropic / openai / openrouter, or wire the standalone model-router.`,
          },
        }, 400)
      }

      return c.json<RouteResult>({
        ok: true,
        data: { content: result.content },
        event: {
          provider,
          model,
          tokensIn:  result.tokensIn,
          tokensOut: result.tokensOut,
          costCents: estimateCostCents(model, result.tokensIn, result.tokensOut),
        },
      })
    } catch (err) {
      const message = (err as Error).message
      return c.json<RouteResult>({ ok: false, error: { code: 'PROVIDER_ERROR', message } }, 502)
    }
  })
}
