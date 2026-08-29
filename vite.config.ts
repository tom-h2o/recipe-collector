import path from "path"
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      workbox: {
        // Without clientsClaim the new worker activates but does not take over
        // pages that are already open, so the first load after a deploy still
        // comes from the old precache and users keep seeing the previous build.
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache read-only Supabase REST requests for offline browsing.
            // Mutations must never be served from or written into the service worker cache.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.protocol === 'https:' &&
              url.hostname.endsWith('.supabase.co') &&
              url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Recipe Vault',
        short_name: 'RecipeVault',
        description: 'Your beautiful personal digital recipe organiser.',
        theme_color: '#315f3b',
        background_color: '#fafafa',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
})
