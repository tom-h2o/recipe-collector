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
      // Registration lives in src/lib/registerServiceWorker.ts: the inline snippet
      // checked for updates only on `load` and never reloaded the page when a new
      // worker took control, so phones kept rendering the previous build.
      injectRegister: null,
      workbox: {
        // Without clientsClaim the new worker activates but does not take over
        // pages that are already open, so the first load after a deploy still
        // comes from the old precache and users keep seeing the previous build.
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // The app ships en/de/fr/es/pl — all Latin script. The font packages
        // also emit Cyrillic, Greek and Vietnamese subsets; unicode-range means
        // a browser never requests them, but the precache would still download
        // them on first load. They stay served, just not pre-fetched.
        globIgnores: ['**/*-{cyrillic,greek,vietnamese}-*.woff2'],
        runtimeCaching: [
          {
            // Recipe photos live in Supabase storage, not under /rest/v1, so the
            // rule below never matched them and none were available offline.
            // Cook mode is a fullscreen kitchen view — losing the pictures on a
            // weak connection is exactly when it matters.
            urlPattern: ({ url, request }) =>
              request.destination === 'image' &&
              url.protocol === 'https:' &&
              url.hostname.endsWith('.supabase.co') &&
              url.pathname.startsWith('/storage/v1/object/public/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'recipe-image-cache',
              expiration: {
                // bounded so a large gallery cannot fill the device
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
