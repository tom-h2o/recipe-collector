/**
 * Recovers when a code-split chunk the page asked for cannot be loaded.
 *
 * App.tsx lazy-loads twelve views. Vite fingerprints every chunk, so a deploy
 * that changes a dependency changes their filenames. A browser holding a
 * cached index.html — which a service worker is in the business of doing —
 * then asks for files that no longer exist, and the view never arrives. It
 * presents as "it works on my phone but not my laptop", because whether it
 * happens depends on exactly which build each device still has cached.
 *
 * So the page reloads — once. index.html is served `max-age=0,
 * must-revalidate` (vercel.json), so the second load normally gets the current
 * one and its real chunk names. If the file still does not arrive, nothing
 * further happens automatically: the failed import surfaces in the top-level
 * error boundary (LoadFailure), which says what happened, names the file, and
 * offers a reload or a reset of the service worker by hand.
 *
 * An automatic service worker reset as a second step was built and then taken
 * out again: the case it was for could not be reproduced, and a recovery step
 * nobody has seen work is just a second way to be wrong.
 *
 * THE ONE RELOAD MUST NOT RE-ARM ITSELF. The first version cleared its marker on
 * the window's `load` event, reasoning "the page loaded, so the retry worked".
 * But `load` fires when the document's own resources are in — a lazy chunk is
 * requested after that. So on a chunk that could never load, every reload
 * fired `load`, cleared the marker, failed again and reloaded again: 352
 * reloads in 20 seconds when measured, which a person sees as a page that
 * flickers and cannot be used. And the fix it replaced was a white page, so
 * this turned a dead screen into a strobing one.
 *
 * That a reload was spent is therefore kept in sessionStorage with a
 * timestamp and expires only with time. Nothing that happens during a page
 * load can reset it.
 */
const MARKER = 'speisekammer:chunk-recovery';

/**
 * How long the spent reload is remembered. It only has to outlast the gap
 * between a reload and the failure that follows it; ten minutes is far beyond
 * that, and short enough that tomorrow's stale deploy gets its own reload.
 */
export const RECOVERY_WINDOW_MS = 10 * 60 * 1000;

/** Longest the service worker cleanup may hold up the reload that follows it. */
const CLEANUP_TIMEOUT_MS = 3000;

let recovering = false;

/** True from the moment a recovery reload has been decided until it happens. */
export function recoveryInProgress(): boolean {
  return recovering;
}

/** Vite's own event, plus the shapes browsers use for a failed module fetch. */
export function looksLikeAMissingChunk(message: string): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Expected a JavaScript/i
    .test(message);
}

/** Whether the reload was already spent inside the window. Null if it cannot be known. */
function reloadAlreadySpent(): boolean | null {
  try {
    const at = Number(sessionStorage.getItem(MARKER));
    return Number.isFinite(at) && at > 0 && Date.now() - at <= RECOVERY_WINDOW_MS;
  } catch {
    return null;
  }
}

/**
 * For the "reset" button on the failure screen; never run automatically.
 * Unregisters every service worker for this origin and deletes the Workbox
 * precache. The runtime caches (recipe photos, read-only API responses) are
 * left alone: they are what makes cook mode work offline and are not what
 * serves the app's own files.
 */
export async function dropServiceWorker(): Promise<void> {
  const work = (async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('workbox-precache')).map((n) => caches.delete(n)));
    }
  })().catch(() => {
    // Cleanup that fails must not stop the reload that follows.
  });
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, CLEANUP_TIMEOUT_MS))]);
}

/** Reloads, unless that was already tried. Returns whether a reload is on its way. */
function reloadOnce(): boolean {
  if (recovering) return true;

  // Private browsing, or storage denied. With nowhere to remember the attempt
  // a loop is possible, so do nothing rather than risk one.
  if (reloadAlreadySpent() !== false) return false;
  try {
    sessionStorage.setItem(MARKER, String(Date.now()));
  } catch {
    return false;
  }

  recovering = true;
  window.location.reload();
  return true;
}

export function recoverFromStaleChunks(): void {
  if (typeof window === 'undefined') return;

  // Fired by Vite when a lazily imported chunk fails to load. Deliberately not
  // preventDefault()ed: that makes Vite resolve the import with `undefined`,
  // and React then reports "Cannot read properties of undefined" instead of
  // the real error, which names the file that failed.
  window.addEventListener('vite:preloadError', () => { reloadOnce(); });

  // A dynamic import that rejects without a preload step lands here instead.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? '');
    if (looksLikeAMissingChunk(message)) reloadOnce();
  });
}

/** For tests: the module remembers that a reload is pending. */
export function resetRecoveryForTests(): void {
  recovering = false;
}
