import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@imba/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 3001,
    host: true,
    proxy: {
      '/yjs': {
        target: 'ws://localhost:1234',
        ws: true,
        changeOrigin: true,
      },
      '/supabase': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/supabase/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          motion: ['framer-motion'],
          editor: ['@tiptap/react', '@tiptap/starter-kit', 'yjs', 'y-websocket'],
        },
      },
    },
  },
})
