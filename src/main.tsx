import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
