/**
 * What's new, newest first.
 *
 * Lives in the codebase rather than the database so an entry ships in the same
 * commit as the change it describes — a release note that can drift from what
 * was actually deployed is worse than none.
 *
 * `id` is the release date and must stay sortable as a plain string: "seen" is
 * stored as the newest id the reader has acknowledged, and anything greater is
 * unread. Never reuse or re-order ids.
 */
export interface ReleaseNote {
  /** YYYY-MM-DD. Sorted and compared as a string. */
  id: string;
  title: string;
  /** Written for someone who uses the app, not someone who reads the diff. */
  items: string[];
}

export const RELEASES: ReleaseNote[] = [
  {
    id: '2026-09-05',
    title: 'Ratings you each own, and a faster brain',
    items: [
      'You and anyone you are connected with can now rate the same recipe separately. Your stars are yours; theirs appear underneath.',
      'Filtering the vault by a connected person actually works. Picking someone used to leave every recipe on screen.',
      'Each AI task can run on its own model. Put tagging and shopping lists on the cheap one and keep extraction on the capable one, in Settings.',
      'Settings can be saved again. Changing your model or temperature unit had been silently failing.',
      'Recipe extraction now uses Google’s current Gemini release automatically, so it keeps improving without an update.',
      'AI requests retry themselves when Google is briefly overloaded, instead of showing you an error.',
      'The notes field no longer calls itself “Personal”. It now says who can actually read it.',
      'Installed app on a phone: new versions arrive on their own rather than needing a reinstall.',
    ],
  },
];

export const LATEST_RELEASE_ID = RELEASES[0]?.id ?? '';

const STORAGE_KEY = 'changelog-seen';

/** The newest release id this reader has acknowledged, or null if never. */
export function readSeenReleaseId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode, or storage blocked. Treating it as "seen" is the quiet
    // choice: a reader who cannot persist the acknowledgement would otherwise
    // be shown the same notes on every single load.
    return LATEST_RELEASE_ID;
  }
}

export function markReleasesSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, LATEST_RELEASE_ID);
  } catch {
    // Nothing to do — see readSeenReleaseId.
  }
}

/** Releases newer than what the reader has seen. Empty when they are up to date. */
export function unreadReleases(seen: string | null = readSeenReleaseId()): ReleaseNote[] {
  if (!seen) {
    // First ever visit. Someone new to the app has no "new" to catch up on, and
    // opening with a changelog is a poor first impression.
    return [];
  }
  return RELEASES.filter((r) => r.id > seen);
}
