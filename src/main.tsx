import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts. These were loaded from the Google Fonts CDN via a CSS
// @import, which blocks rendering until a third-party round trip completes.
// wght-italic is needed because RecipeDetail renders an italic serif description.
import '@fontsource-variable/newsreader'
import '@fontsource-variable/newsreader/wght-italic.css'
import '@fontsource-variable/manrope'
import './index.css'
import App from './App.tsx'
import { initSentry } from './lib/sentry'
import { registerServiceWorker } from './lib/registerServiceWorker'

initSentry()

// Registered here rather than by vite-plugin-pwa's inline snippet, which never
// re-checked for a new worker on an installed PWA and never reloaded the page
// when one took over. See registerServiceWorker.ts.
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
