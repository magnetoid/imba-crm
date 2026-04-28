// Lightweight provider-direct AI client for the inbox-puller.
// Mirrors the shape of @imba/shared/lib/ai but runs in Node with the
// service_role key, reading the per-provider secret from
// crm_provider_credentials. Keeps the puller self-contained — no
// dependency on a Supabase Edge Function being deployed.

import { supabase } from './supabase.js'

type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'perplexity' | 'ollama'

interface AISettings {
  active_ai_provider: ProviderName
  active_ai_model: string
  anthropic_model: string
  openai_model: string
  gemini_model: string
  perplexity_model: string
  ollama_base_url: string
  ollama_model: string
  ai_inbox_auto_categorize: boolean
}

export async function getAISettings(): Promise<AISettings | null> {
  const { data, error } = await supabase
    .from('crm_runtime_settings')
    .select('active_ai_provider, active_ai_model, anthropic_model, openai_model, gemini_model, perplexity_model, ollama_base_url, ollama_model, ai_inbox_auto_categorize')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data) return null
  return data as AISettings
}

async function getKey(provider: ProviderName): Promise<string | null> {
  const { data } = await supabase
    .from('crm_provider_credentials')
    .select('api_key')
    .eq('provider', provider)
    .maybeSingle()
  return (data as { api_key: string | null } | null)?.api_key ?? null
}

interface JSONCallOpts {
  systemPrompt?: string
  userPrompt: string
  maxTokens?: number
}

/**
 * Call the configured AI provider with a JSON-output prompt. Returns
 * the parsed JSON object or null on any failure (network, API error,
 * unparseable response, missing key). Designed to be a "best effort"
 * — if it fails we leave the row unannotated rather than retrying.
 */
export async function callAIJSON<T = unknown>(opts: JSONCallOpts): Promise<T | null> {
  const settings = await getAISettings()
  if (!settings) return null
  const provider = settings.active_ai_provider

  try {
    const apiKey = provider === 'ollama' ? '' : await getKey(provider)
    if (provider !== 'ollama' && !apiKey) return null

    const sys = opts.systemPrompt ?? 'You output strictly valid minified JSON. No prose, no markdown.'
    const max = opts.maxTokens ?? 600

    let raw = ''
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.anthropic_model || 'claude-sonnet-4-20250514',
          max_tokens: max,
          system: sys,
          messages: [{ role: 'user', content: opts.userPrompt }],
        }),
      })
      if (!res.ok) return null
      const json = await res.json() as { content?: Array<{ type: string; text: string }> }
      raw = json.content?.[0]?.text ?? ''
    } else if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: settings.openai_model || 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: opts.userPrompt },
          ],
        }),
      })
      if (!res.ok) return null
      const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      raw = json.choices?.[0]?.message?.content ?? ''
    } else if (provider === 'gemini') {
      const model = settings.gemini_model || 'gemini-2.5-flash'
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: 'user', parts: [{ text: opts.userPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: max },
        }),
      })
      if (!res.ok) return null
      const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    } else if (provider === 'perplexity') {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: settings.perplexity_model || 'sonar',
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: opts.userPrompt },
          ],
        }),
      })
      if (!res.ok) return null
      const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      raw = json.choices?.[0]?.message?.content ?? ''
    } else if (provider === 'ollama') {
      const base = settings.ollama_base_url || 'http://host.docker.internal:11434'
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: settings.ollama_model || 'llama3.1',
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: opts.userPrompt },
          ],
        }),
      })
      if (!res.ok) return null
      const json = await res.json() as { message?: { content?: string } }
      raw = json.message?.content ?? ''
    }

    if (!raw) return null
    // Some providers wrap JSON in code fences; tolerate that.
    const cleaned = raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '').trim()
    return JSON.parse(cleaned) as T
  } catch {
    return null
  }
}

export interface CategorizeResult {
  category: 'question' | 'objection' | 'meeting_request' | 'positive_reply' | 'unsubscribe' | 'bounce' | 'spam' | 'other'
  sentiment: 'positive' | 'neutral' | 'negative'
  suggested_reply: string
}

export async function categorizeInboundMessage(input: {
  from_email: string | null
  subject: string | null
  body: string
}): Promise<CategorizeResult | null> {
  const userPrompt = `Analyze this inbound email to a sales/CRM and return JSON with three fields:

  category: one of "question" | "objection" | "meeting_request" | "positive_reply" | "unsubscribe" | "bounce" | "spam" | "other"
  sentiment: one of "positive" | "neutral" | "negative"
  suggested_reply: a draft reply (3-6 sentences, polite, concrete next step)

From: ${input.from_email ?? 'unknown'}
Subject: ${input.subject ?? '(no subject)'}
Body:
${(input.body ?? '').slice(0, 4000)}

Return JSON only.`

  const out = await callAIJSON<CategorizeResult>({ userPrompt, maxTokens: 600 })
  if (!out || typeof out !== 'object') return null
  if (!out.category || !out.sentiment) return null
  return out
}
