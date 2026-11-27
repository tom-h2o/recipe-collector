import { useEffect } from 'react';

/**
 * Keeps the screen on while `active` (cook mode): a phone otherwise dims and
 * locks at its auto-lock delay, exactly when the cook's hands are in dough.
 *
 * The browser drops a wake lock whenever the page is hidden (app switcher, a
 * call, the screen locked by hand), and does not give it back, so it is asked
 * for again each time the page becomes visible while still active.
 *
 * Where the API is missing, or the request is refused (low power mode, an
 * older installed web app), nothing happens and nothing is said: cook mode
 * works as it did before.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = typeof navigator !== 'undefined' ? navigator.wakeLock : undefined;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function acquire() {
      if (cancelled || document.visibilityState !== 'visible') return;
      // Still held: asking again would stack a second lock.
      if (sentinel && !sentinel.released) return;
      try {
        const next = await wakeLock!.request('screen');
        // Cook mode may have closed while the request was pending.
        if (cancelled) { void next.release().catch(() => {}); return; }
        sentinel = next;
      } catch {
        // Refused. Not an error anyone can act on.
      }
    }

    void acquire();
    document.addEventListener('visibilitychange', acquire);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
