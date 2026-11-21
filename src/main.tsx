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
import { recoverFromStaleChunks } from './lib/recoverFromStaleChunks'
import { initPressFeedback } from './lib/pressFeedback'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadFailure } from './components/LoadFailure'

initSentry()

// Before anything lazy-loads: a deploy that renamed the chunks this page was
// told to fetch otherwise leaves a white screen with no error anyone can see.
recoverFromStaleChunks()

// Registered here rather than by vite-plugin-pwa's inline snippet, which never
// re-checked for a new worker on an installed PWA and never reloaded the page
// when one took over. See registerServiceWorker.ts.
registerServiceWorker()

// Touch feedback for everything tappable; the styles are in index.css.
initPressFeedback()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* The lazy views in App sit under no other boundary. Without this one a
        view whose file will not load unmounts everything: a white page. */}
    <ErrorBoundary fallbackRender={(error) => <LoadFailure error={error} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
