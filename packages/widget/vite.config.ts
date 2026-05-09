import { defineConfig } from 'vite'
import { resolve } from 'path'

// Build a single self-contained widget.js that any third-party site can
// embed with <script src="https://crm.imbaproduction.com/widget.js"></script>.
// No React, no global CSS — the widget injects a Shadow DOM so it can't
// collide with the host page's styles.
export default defineConfig({
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'widget.js',
        inlineDynamicImports: true,
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
})
