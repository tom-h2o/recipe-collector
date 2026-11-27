import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

/** A fake Screen Wake Lock API that records what was asked of it. */
function fakeWakeLock() {
  const sentinels: { released: boolean; release: ReturnType<typeof vi.fn> }[] = [];
  const request = vi.fn(async (type: string) => {
    expect(type).toBe('screen');
    const sentinel = {
      released: false,
      release: vi.fn(async () => { sentinel.released = true; }),
    };
    sentinels.push(sentinel);
    return sentinel;
  });
  return { request, sentinels };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useWakeLock', () => {
  let lock: ReturnType<typeof fakeWakeLock>;

  beforeEach(() => {
    lock = fakeWakeLock();
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: lock });
    setVisibility('visible');
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('asks for the screen while active and lets go when it ends', async () => {
    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } });
    await flush();
    expect(lock.request).toHaveBeenCalledWith('screen');
    expect(lock.sentinels[0].released).toBe(false);

    rerender({ active: false });
    expect(lock.sentinels[0].release).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing while inactive', async () => {
    renderHook(() => useWakeLock(false));
    await flush();
    expect(lock.request).not.toHaveBeenCalled();
  });

  it('asks again when the page comes back, because the browser dropped the lock', async () => {
    renderHook(() => useWakeLock(true));
    await flush();
    // What the browser does when the app is put in the background.
    lock.sentinels[0].released = true;
    setVisibility('hidden');
    await flush();
    expect(lock.request).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await flush();
    expect(lock.request).toHaveBeenCalledTimes(2);
  });

  it('does not stack a second lock while the first is still held', async () => {
    renderHook(() => useWakeLock(true));
    await flush();
    setVisibility('visible');
    await flush();
    expect(lock.request).toHaveBeenCalledTimes(1);
  });

  it('releases a lock that arrives after cook mode has closed', async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    unmount();
    await flush();
    expect(lock.sentinels[0].release).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the phone refuses (low power mode)', async () => {
    lock.request.mockRejectedValueOnce(new DOMException('refused', 'NotAllowedError'));
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await flush();
  });

  it('does nothing where the API does not exist', () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });
});
