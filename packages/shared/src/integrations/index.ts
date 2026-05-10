// Re-exports for convenient importing. Integration clients are pure
// HTTP wrappers — callers pass a ProviderCredential.

export { runApifyActor } from './apify'
export type { ApifyRunOptions, ApifyRunResult, ApifyRunStatus } from './apify'

export { findEmail, verifyEmail } from './hunter'
export type { FoundEmail } from './hunter'

export { enrichPerson } from './apollo'
export type { ApolloPerson } from './apollo'

export { createSession as createBrowserSession, endSession as endBrowserSession } from './browserbase'
export type { BrowserbaseSession } from './browserbase'

export { findSlots, bookingUrl } from './cal'
export type { CalSlot } from './cal'

export { parseLoomUrl, buildLoomEmailHtml } from './loom'
export type { LoomEmbed } from './loom'

export { IntegrationError } from './_creds'
export type { ProviderCredential } from './_creds'
