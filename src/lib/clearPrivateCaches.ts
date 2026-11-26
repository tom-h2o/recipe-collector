/**
 * The service worker's caches that hold one person's data (vite.config.ts):
 * database answers, kept a week for offline reading, and recipe photos.
 */
export const PRIVATE_CACHES = ['supabase-api-cache', 'recipe-image-cache'] as const;

/**
 * Empties them when someone signs out. Otherwise, on a shared device, the next
 * person to open the app offline could be shown the last one's recipes, notes
 * and plans straight from the cache. Never throws: signing out must not fail
 * because a cache could not be cleared, and a browser without Cache Storage
 * has nothing to clear.
 */
export async function clearPrivateCaches(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    await Promise.all(PRIVATE_CACHES.map((name) => caches.delete(name)));
  } catch {
    // Nothing to do: see above.
  }
}
