import { useState, useCallback, useMemo } from 'react';
import {
  RELEASES,
  LATEST_RELEASE_ID,
  readSeenReleaseId,
  markReleasesSeen,
  unreadReleases,
} from '@/lib/changelog';

export function useChangelog() {
  /**
   * Resolved once, in an initializer rather than an effect, so there is no
   * render with the badge in the wrong state and no cascading re-render.
   *
   * A first ever visit records the marker immediately and reports nothing
   * unread: someone who has just arrived has no catching up to do, but without
   * writing the marker now there would be nothing to compare against when the
   * *next* release ships, and they would never be told about that either.
   */
  const [seenAtMount] = useState(() => {
    const seen = readSeenReleaseId();
    if (seen === null) {
      markReleasesSeen();
      return LATEST_RELEASE_ID;
    }
    return seen;
  });

  const [acknowledged, setAcknowledged] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const unread = useMemo(
    () => (acknowledged ? [] : unreadReleases(seenAtMount)),
    [acknowledged, seenAtMount],
  );

  const open = useCallback(() => setIsOpen(true), []);

  /** Closing is the acknowledgement; there is no separate dismiss action. */
  const close = useCallback(() => {
    setIsOpen(false);
    markReleasesSeen();
    setAcknowledged(true);
  }, []);

  return {
    isOpen,
    open,
    close,
    /** Every release, for the always-available menu entry. */
    releases: RELEASES,
    /** Only what this reader has not acknowledged; drives the badge. */
    unread,
    hasUnread: unread.length > 0,
    latestReleaseId: LATEST_RELEASE_ID,
  };
}
