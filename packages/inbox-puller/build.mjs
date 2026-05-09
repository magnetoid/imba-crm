// Bundles the worker to a single dist/index.js. Externalises everything
// in node_modules so the runner image still pnpm-installs them, but
// inlines our @imba/shared workspace package — Node at runtime can't
// import .ts files from a workspace symlink, so we have to bake them in.

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const sharedSrc = resolve(here, '../shared/src')

await build({
  entryPoints: [resolve(here, 'src/index.ts')],
  outfile: resolve(here, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // Anything from node_modules stays external (the runner image installs them).
  packages: 'external',
  // …except our workspace package, which we inline by aliasing its
  // import paths to the source .ts files.
  alias: {
    '@imba/shared/integrations/apify':       `${sharedSrc}/integrations/apify.ts`,
    '@imba/shared/integrations/hunter':      `${sharedSrc}/integrations/hunter.ts`,
    '@imba/shared/integrations/apollo':      `${sharedSrc}/integrations/apollo.ts`,
    '@imba/shared/integrations/browserbase': `${sharedSrc}/integrations/browserbase.ts`,
    '@imba/shared/integrations/cal':         `${sharedSrc}/integrations/cal.ts`,
    '@imba/shared/integrations/_creds':      `${sharedSrc}/integrations/_creds.ts`,
    '@imba/shared/integrations':             `${sharedSrc}/integrations/index.ts`,
  },
  banner: {
    // Recreate __dirname / require for the few CommonJS-only deps.
    js: `import { createRequire as _cR } from 'module'; const require = _cR(import.meta.url);`,
  },
  logLevel: 'info',
})
