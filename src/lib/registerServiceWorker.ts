/**
 * Service worker registration, replacing vite-plugin-pwa's inline snippet.
 *
 * The generated worker already calls skipWaiting() and clientsClaim(), so a new
 * build activates and takes control immediately. That was still not enough for a
 * phone to see a new version, for three separate reasons:
 *
 *  1. The default `updateViaCache` lets the browser serve /sw.js from its own
 *     HTTP cache for up to 24 hours, so the update check can compare the new
 *     worker against a stale copy and conclude nothing changed.
 *  2. The inline snippet only checked on the `load` event. An installed PWA that
 *     is resumed from the app switcher rather than started fresh may not fire
 *     that for days.
 *  3. Taking control is not the same as reloading. clientsClaim() lets the new
 *     worker serve the open page, but that page keeps the JavaScript it already
 *     parsed, so it goes on rendering the old build until something reloads it.
 */

/** How often to ask the server whether a newer worker exists. */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  // Captured before any update can land. A page that starts with no controller
  // is a first-ever visit: the controllerchange that follows installation is
  // expected and must not trigger a reload, or every new visitor reloads once
  // for no reason.
  const hadController = !!navigator.serviceWorker.controller;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      // updateViaCache: 'none' forces the worker script itself to be revalidated
      // against the network rather than read from the HTTP cache.
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        const checkForUpdate = () => { void registration.update().catch(() => {}); };

        // Covers a tab left open for days.
        setInterval(checkForUpdate, UPDATE_INTERVAL_MS);

        // Covers the installed-PWA case: resuming from the app switcher fires
        // visibilitychange even when `load` never runs again.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
      })
      .catch(() => {
        // A failed registration must never break the app; it only costs offline
        // support until the next load.
      });
  });
}
