// call-analyzer agent
// Input: { activity_id }   — points at a crm_activities row of type='meeting'
//                            with a recording_url and/or transcript_text.
// Steps:
//   1. load-activity     — pull the activity + lead context
//   2. transcribe        — if no transcript_text, send recording_url
//                          through OpenAI Whisper (api: /audio/transcriptions)
//                          and persist the text. Skipped if transcript_text
//                          is already populated.
//   3. extract           — AI extracts a structured "coach card":
//                          summary / next_steps / objections / MEDDPICC /
//                          sentiment / questions_to_ask_next.
//   4. persist           — write the result to crm_activities.coach_notes.
//
// Runs in 'auto' mode by default — the operator only sees the polished
// coach card on the lead detail page; no human approval is needed.

import type { AgentContext, JobRow } from './runtime.js'
import { supabase, loadProviderCredential } from '../supabase.js'
import { callAIJSON, getAISettings } from '../ai.js'

interface ActivityRow {
  id: string
  lead_id: string | null
  subject: string | null
  body: string | null
  recording_url: string | null
  transcript_text: string | null
  transcript_url: string | null
  created_at: string
}

interface CoachNotes {
  summary: string
  next_steps: Array<{ text: string; owner: 'us' | 'them' }>
  objections: string[]
  questions_to_ask_next: string[]
  meddpicc: {
    metrics?: string
    economic_buyer?: string
    decision_criteria?: string
    decision_process?: string
    paper_process?: string
    identify_pain?: string
    champion?: string
    competition?: string
  }
  sentiment: 'positive' | 'neutral' | 'negative'
  score: number     // 0–100, AI-felt deal momentum
  ai_model?: string
  computed_at: string
}

const MAX_TRANSCRIPT_CHARS = 32_000  // truncate so we don't exceed model context

export async function runCallAnalyzer(ctx: AgentContext, job: JobRow): Promise<Record<string, unknown>> {
  const activityId = job.input.activity_id as string | undefined
  if (!activityId) throw new Error('activity_id missing on job input')

  // ── Step 1: load activity ────────────────────────────────────────
  const activity = await ctx.step('load-activity', { activity_id: activityId }, async () => {
    const { data } = await supabase
      .from('crm_activities')
      .select('id, lead_id, subject, body, recording_url, transcript_text, transcript_url, created_at')
      .eq('id', activityId)
      .maybeSingle()
    if (!data) throw new Error(`activity ${activityId} not found`)
    return data as ActivityRow
  }) as ActivityRow

  // ── Step 2: transcribe (if needed) ───────────────────────────────
  let transcript = activity.transcript_text ?? ''
  if (!transcript && activity.recording_url) {
    transcript = await ctx.step('transcribe', { recording_url: activity.recording_url }, async (s) => {
      const text = await whisperTranscribe(activity.recording_url!)
      if (text) {
        await supabase.from('crm_activities')
          .update({ transcript_text: text.slice(0, 1_000_000) })
          .eq('id', activity.id)
        s.cost({ model: 'whisper-1' })
      }
      return text ?? ''
    }) as string
  }

  if (!transcript) {
    // No transcript and no recording — fall back to whatever is in the
    // activity body (manually-typed call notes still benefit from
    // structured extraction).
    transcript = activity.body ?? ''
  }
  if (!transcript || transcript.length < 30) {
    throw new Error('not enough text to analyse')
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS)
  }

  // Lead context for the prompt — helps the AI ground next-steps in
  // what we actually offer.
  let leadContext = ''
  if (activity.lead_id) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('name, company, service_interest, value, stage, ai_notes')
      .eq('id', activity.lead_id)
      .maybeSingle()
    if (lead) {
      const l = lead as { name?: string; company?: string; service_interest?: string; value?: number; stage?: string; ai_notes?: string }
      leadContext = `Lead: ${l.name ?? '?'} @ ${l.company ?? '?'}\n` +
                    `Service interest: ${l.service_interest ?? '?'}\n` +
                    `Stage: ${l.stage ?? '?'}\n` +
                    `Deal value: ${l.value ?? '?'}\n` +
                    `Prior notes: ${l.ai_notes ?? '(none)'}`
    }
  }

  // ── Step 3: AI extraction ────────────────────────────────────────
  const notes = await ctx.step('extract', { transcript_chars: transcript.length }, async (s) => {
    const settings = await getAISettings()
    const prompt = `You are a senior B2B sales coach. The transcript below is a sales call between us (the seller) and a prospect.
${leadContext ? '\nContext:\n' + leadContext + '\n' : ''}
Transcript:
"""
${transcript}
"""

Extract a structured coach card. Be specific — quote actual phrases the prospect used. If a MEDDPICC field is not mentioned, leave it as an empty string.

Return ONLY valid minified JSON in this exact shape:
{"summary":"string (1-2 sentences)","next_steps":[{"text":"string","owner":"us|them"}],"objections":["string"],"questions_to_ask_next":["string"],"meddpicc":{"metrics":"string","economic_buyer":"string","decision_criteria":"string","decision_process":"string","paper_process":"string","identify_pain":"string","champion":"string","competition":"string"},"sentiment":"positive|neutral|negative","score":75}`

    const result = await callAIJSON<Omit<CoachNotes, 'computed_at' | 'ai_model'>>({ userPrompt: prompt, maxTokens: 1200 })
    if (!result) throw new Error('AI extraction returned no result')
    s.cost({ model: settings?.active_ai_model })
    return result
  }) as Omit<CoachNotes, 'computed_at' | 'ai_model'>

  // ── Step 4: persist ──────────────────────────────────────────────
  const final: CoachNotes = {
    ...notes,
    ai_model: (await getAISettings())?.active_ai_model,
    computed_at: new Date().toISOString(),
  }

  await ctx.step('persist', { activity_id: activity.id }, async () => {
    const { error } = await supabase
      .from('crm_activities')
      .update({ coach_notes: final })
      .eq('id', activity.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

  return {
    activity_id: activity.id,
    transcript_chars: transcript.length,
    next_steps: final.next_steps.length,
    objections: final.objections.length,
    sentiment: final.sentiment,
    score: final.score,
  }
}

// ── Whisper transcription ─────────────────────────────────────────────
// Uses OpenAI's /v1/audio/transcriptions endpoint. Pricing is $0.006/min
// (ish) so it's cheap. Requires the operator to have stored an OpenAI
// API key under provider='openai'. If no key, we return null and the
// caller falls back to the activity body.
async function whisperTranscribe(recordingUrl: string): Promise<string | null> {
  const cred = await loadProviderCredential('openai')
  if (!cred?.apiKey) return null

  // 1. Pull the recording bytes. Many providers (Daily, Whereby, Cal)
  //    return signed URLs; we don't follow redirects manually.
  let media: ArrayBuffer
  let contentType = 'audio/mp4'
  try {
    const res = await fetch(recordingUrl)
    if (!res.ok) return null
    contentType = res.headers.get('content-type') ?? contentType
    media = await res.arrayBuffer()
  } catch {
    return null
  }

  // 2. Send as multipart/form-data to Whisper.
  const ext = contentType.includes('mp3')   ? 'mp3'
            : contentType.includes('webm')  ? 'webm'
            : contentType.includes('wav')   ? 'wav'
            : contentType.includes('m4a')   ? 'm4a'
            : 'mp4'
  const fd = new FormData()
  fd.append('file',  new Blob([media], { type: contentType }), `recording.${ext}`)
  fd.append('model', 'whisper-1')

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cred.apiKey}` },
      body: fd,
    })
    if (!res.ok) return null
    const json = await res.json() as { text?: string }
    return json.text ?? null
  } catch {
    return null
  }
}
