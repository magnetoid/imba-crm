// Map of agent_kind → run function. Adding a new agent is one entry here.
//
// Each agent is just an async function that receives the AgentContext;
// it composes ctx.step() calls. The runtime owns autonomy gating, run
// logging, and approval polling — the agent just describes the steps.

import type { AgentContext, JobRow } from './runtime.js'
import { runOutreachDrafter } from './outreach-drafter.js'
import { runLeadEnricher }    from './lead-enricher.js'
import { runLeadFinder }      from './lead-finder.js'
import { runInboxReplier }    from './inbox-replier.js'
import { runMeetingBooker }   from './meeting-booker.js'
import { runLeadScorer }      from './lead-scorer.js'

export type AgentRunner = (ctx: AgentContext, job: JobRow) => Promise<Record<string, unknown> | void>

export const AGENT_REGISTRY: Record<string, AgentRunner> = {
  'outreach-drafter': runOutreachDrafter,
  'lead-enricher':    runLeadEnricher,
  'lead-finder':      runLeadFinder,
  'inbox-replier':    runInboxReplier,
  'meeting-booker':   runMeetingBooker,
  'lead-scorer':      runLeadScorer,
  // 'proposal-writer':  runProposalWriter,   // future
}

export function isKnownAgent(kind: string): boolean {
  return Object.hasOwn(AGENT_REGISTRY, kind)
}
