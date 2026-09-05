import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChangelog } from './useChangelog';
import { LATEST_RELEASE_ID } from '@/lib/changelog';

beforeEach(() => window.localStorage.clear());

describe('useChangelog', () => {
  it('shows nothing to a first-time visitor', () => {
    const { result } = renderHook(() => useChangelog());
    expect(result.current.hasUnread).toBe(false);
  });

  it('records the marker on a first visit, so the NEXT release is not missed too', () => {
    // Without this write there is nothing to compare against later, and the
    // reader would silently never be told about any future release.
    renderHook(() => useChangelog());
    expect(window.localStorage.getItem('changelog-seen')).toBe(LATEST_RELEASE_ID);
  });

  it('flags unread notes for a returning reader on an older version', () => {
    window.localStorage.setItem('changelog-seen', '2000-01-01');
    const { result } = renderHook(() => useChangelog());
    expect(result.current.hasUnread).toBe(true);
    expect(result.current.unread.length).toBeGreaterThan(0);
  });

  it('clears the badge and persists it once the notes are closed', () => {
    window.localStorage.setItem('changelog-seen', '2000-01-01');
    const { result } = renderHook(() => useChangelog());

    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.hasUnread).toBe(false);
    expect(window.localStorage.getItem('changelog-seen')).toBe(LATEST_RELEASE_ID);
  });

  it('still lists every release for someone who is up to date', () => {
    // The menu entry is always available, not only when something is unread.
    window.localStorage.setItem('changelog-seen', LATEST_RELEASE_ID);
    const { result } = renderHook(() => useChangelog());
    expect(result.current.hasUnread).toBe(false);
    expect(result.current.releases.length).toBeGreaterThan(0);
  });
});
