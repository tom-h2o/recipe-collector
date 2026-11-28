/**
 * "First steps": whether this person has been shown the guide on this device.
 *
 * Kept per device and per account in localStorage, like the release notes'
 * marker: no migration and no write on every visit. A second device shows it
 * once more to someone whose vault is still empty, which is when it is useful.
 */
const KEY = 'sk-first-steps-seen';

function keyFor(userId: string) {
  return `${KEY}:${userId}`;
}

export function hasSeenFirstSteps(userId: string): boolean {
  try {
    return localStorage.getItem(keyFor(userId)) === '1';
  } catch {
    // Storage unavailable: never open it unasked, or it would open every time.
    return true;
  }
}

export function markFirstStepsSeen(userId: string) {
  try {
    localStorage.setItem(keyFor(userId), '1');
  } catch {
    // Nothing to remember it in.
  }
}

/** Opened from the Home Screen (or installed), not in a browser tab. */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
