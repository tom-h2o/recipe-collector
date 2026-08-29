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

initSentry()

// The service worker is registered by vite-plugin-pwa (injectRegister: 'inline').
// Registering it again here raced with that one.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
