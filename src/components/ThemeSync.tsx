import { useDarkMode } from '@/hooks/useDarkMode';

/**
 * Applies the light/dark class on routes that render neither Layout nor
 * AuthGate — the public share page and /about.
 *
 * useDarkMode is what puts `dark` on <html>, and it was only ever called from
 * those two components. A guest following a share link renders neither, so
 * every `dark:` class on those pages was dead and the page stayed light on a
 * device set to dark. Mounted only on the guest routes, so the signed-in app
 * keeps exactly one instance of the hook.
 */
export function ThemeSync() {
  useDarkMode();
  return null;
}
