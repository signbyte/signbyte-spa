import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// The SPA is served behind the public edge, co-located with the portal API so the
// session cookie stays same-site. In dev we proxy the API path to the local stack.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api/portal': {
        target: process.env.DEV_API_TARGET ?? 'http://localhost:5009',
        changeOrigin: true,
      },
    },
  },
})
