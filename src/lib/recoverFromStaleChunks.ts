/**
 * Reloads once when a code-split chunk the page asked for is no longer on the
 * server.
 *
 * App.tsx lazy-loads twelve views. Vite fingerprints every chunk, so a deploy
 * that changes a dependency changes their filenames. A browser holding a
 * cached index.html — which a service worker is in the business of doing —
 * then asks for files that no longer exist, the dynamic import rejects, and
 * nothing renders: a white page, with the app's own ErrorBoundary never
 * reached because the failure happens before React has anything to mount.
 *
 * It presents as "it works on my phone but not my laptop", because whether it
 * happens depends on exactly which build each device still has cached.
 *
 * Reloading fixes it: index.html is served with `max-age=0, must-revalidate`
 * (vercel.json), so the second load gets the current one and its real chunk
 * names.
 *
 * The one-shot marker matters. If a reload cannot fix it — the chunk is really
 * gone, an offline device, a broken deploy — a naive handler reloads forever.
 * sessionStorage scopes the marker to this tab and clears itself when the page
 * finally loads.
 */
const MARKER = 'speisekammer:chunk-reload';

/** Vite's own event, plus the shapes browsers use for a failed module fetch. */
function looksLikeAMissingChunk(message: string): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i
    .test(message);
}

function reloadOnce(): void {
  let alreadyTried = false;
  try {
    alreadyTried = sessionStorage.getItem(MARKER) === '1';
    sessionStorage.setItem(MARKER, '1');
  } catch {
    // Private browsing, or storage denied. Without a marker a reload loop is
    // possible, so do nothing rather than risk one.
    return;
  }
  if (alreadyTried) return;
  window.location.reload();
}

export function recoverFromStaleChunks(): void {
  if (typeof window === 'undefined') return;

  // Fired by Vite when a lazily imported chunk fails to load. The most
  // reliable signal, and specific enough to act on without inspecting text.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadOnce();
  });

  // A dynamic import that rejects without a preload step lands here instead.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? '');
    if (looksLikeAMissingChunk(message)) reloadOnce();
  });

  // Clear the marker once a load has succeeded, so a future stale deploy is
  // allowed its own single reload.
  window.addEventListener('load', () => {
    try { sessionStorage.removeItem(MARKER); } catch { /* nothing to clear */ }
  });
}
