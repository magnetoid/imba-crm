// Convenience re-exports. Importers can `import { runApifyActor } from
// '@imba/shared/integrations'`. Each module also exports its own client
// directly under '@imba/shared/integrations/<name>' for tree-shaking.

export { runApifyActor } from './apify'
export type { ApifyRunOptions, ApifyRunResult } from './apify'

export { findEmail, verifyEmail } from './hunter'
export type { FoundEmail } from './hunter'

export { enrichPerson } from './apollo'
export type { ApolloPerson } from './apollo'

export { createSession as createBrowserSession, endSession as endBrowserSession } from './browserbase'
export type { BrowserbaseSession } from './browserbase'

export { findSlots, bookingUrl } from './cal'
export type { CalSlot } from './cal'

export { getProviderCredential, IntegrationError } from './_creds'
