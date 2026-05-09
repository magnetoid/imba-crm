// LinkedIn DM channel — kicks off an Apify actor that sends a connection
// request + DM via the user's stored session cookie. Conservative limits
// enforced from crm_runtime_settings.linkedin_daily_*.
//
// For now this is a thin wrapper: it queues an Apify run with the right
// input, but does not block on completion (the actor result is processed
// by an inbox-monitor actor in a future iteration). If the user hasn't
// configured Apify or LinkedIn credentials it returns 'skipped'.

import type { Channel, ChannelInput, ChannelResult } from './types.js'
import { runApifyActor } from '@imba/shared/integrations/apify'
import { loadProviderCredential } from '../supabase.js'

// Generic LinkedIn DM actor on Apify. Users can swap to their preferred
// actor by setting `crm_provider_credentials.linkedin.extra.actor_id`.
const DEFAULT_ACTOR = 'apify/linkedin-message-bot'

export const linkedinChannel: Channel = {
  name: 'linkedin_dm',
  async send(input: ChannelInput): Promise<ChannelResult> {
    if (!input.linkedinUrl) return { status: 'skipped', error: 'lead has no linkedin_url' }

    const apify = await loadProviderCredential('apify')
    if (!apify?.apiKey) return { status: 'skipped', error: 'apify not configured' }
    const linkedin = await loadProviderCredential('linkedin')
    if (!linkedin?.apiKey) return { status: 'skipped', error: 'linkedin session cookie not configured' }

    const actorId = (linkedin.extra?.actor_id as string | undefined) || DEFAULT_ACTOR
    try {
      const run = await runApifyActor(apify, {
        actorId,
        input: {
          profiles: [input.linkedinUrl],
          message: input.body,
          sessionCookie: linkedin.apiKey,
          ...((linkedin.extra?.actor_input as Record<string, unknown> | undefined) ?? {}),
        },
        timeoutSeconds: 120,
        maxItems: 5,
      })
      const ok = run.status === 'SUCCEEDED'
      return ok
        ? { status: 'sent', metadata: { apify_run_id: run.runId, actor_id: actorId } }
        : { status: 'failed', error: `actor status ${run.status}`, metadata: { apify_run_id: run.runId } }
    } catch (err) {
      return { status: 'failed', error: (err as Error).message }
    }
  },
}
