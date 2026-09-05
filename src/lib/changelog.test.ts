import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RELEASES, LATEST_RELEASE_ID, unreadReleases, readSeenReleaseId, markReleasesSeen } from './changelog';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('release notes', () => {
  it('are ordered newest first', () => {
    const ids = RELEASES.map((r) => r.id);
    expect([...ids].sort().reverse()).toEqual(ids);
  });

  it('use sortable date ids, because "unread" is a string comparison', () => {
    for (const r of RELEASES) expect(r.id, `${r.id} is not YYYY-MM-DD`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has no duplicate ids', () => {
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('says something in every entry', () => {
    for (const r of RELEASES) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.items.length).toBeGreaterThan(0);
      for (const item of r.items) expect(item.length).toBeGreaterThan(20);
    }
  });

  it('LATEST_RELEASE_ID is the newest entry', () => {
    expect(LATEST_RELEASE_ID).toBe(RELEASES[0].id);
  });
});

describe('unreadReleases', () => {
  it('returns nothing when the reader is up to date', () => {
    expect(unreadReleases(LATEST_RELEASE_ID)).toEqual([]);
  });

  it('returns only releases newer than what was seen', () => {
    const older = '2000-01-01';
    expect(unreadReleases(older).map((r) => r.id)).toEqual(RELEASES.map((r) => r.id));
  });

  it('shows nothing to a first-time visitor', () => {
    // Opening the app for the first time with a list of "new" features is a poor
    // introduction — none of it is new to someone who has never seen any of it.
    expect(unreadReleases(null)).toEqual([]);
  });
});

describe('persistence', () => {
  it('round-trips the acknowledgement', () => {
    expect(readSeenReleaseId()).toBeNull();
    markReleasesSeen();
    expect(readSeenReleaseId()).toBe(LATEST_RELEASE_ID);
  });

  it('treats unavailable storage as up to date, not as unread', () => {
    // Private browsing, or storage blocked. The alternative is showing the same
    // notes on every single page load with no way to dismiss them.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readSeenReleaseId()).toBe(LATEST_RELEASE_ID);
    expect(unreadReleases(readSeenReleaseId())).toEqual([]);
  });

  it('does not throw when the acknowledgement cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => markReleasesSeen()).not.toThrow();
  });
});
