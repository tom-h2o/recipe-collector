import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCookTimer } from './useCookTimer';

beforeEach(() => {
  vi.useFakeTimers();
  // No AudioContext in jsdom; the hook must cope rather than throw mid-cook.
  vi.stubGlobal('AudioContext', undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useCookTimer', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useCookTimer());
    expect(result.current.isActive).toBe(false);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it('counts down', () => {
    const { result } = renderHook(() => useCookTimer());
    act(() => result.current.start(60));
    expect(result.current.remaining).toBe(60);

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.remaining).toBe(50);
  });

  it('measures elapsed wall-clock time, not the number of ticks', () => {
    // The reason this matters: browsers throttle intervals in a background tab,
    // so a decrement-per-tick timer silently loses minutes while the phone is
    // locked. The deadline is absolute, so the truth survives.
    const { result } = renderHook(() => useCookTimer());
    act(() => result.current.start(300));

    act(() => { vi.advanceTimersByTime(120_000); });
    expect(result.current.remaining).toBe(180);
  });

  it('finishes at zero and stops running', () => {
    const { result } = renderHook(() => useCookTimer());
    act(() => result.current.start(5));
    act(() => { vi.advanceTimersByTime(6_000); });

    expect(result.current.remaining).toBe(0);
    expect(result.current.isDone).toBe(true);
    expect(result.current.isRunning).toBe(false);
  });

  it('never counts past zero into negative time', () => {
    const { result } = renderHook(() => useCookTimer());
    act(() => result.current.start(5));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.remaining).toBe(0);
  });

  it('pauses and resumes without losing or inventing time', () => {
    const { result } = renderHook(() => useCookTimer());
    act(() => result.current.start(100));
    act(() => { vi.advanceTimersByTime(10_000); });
    act(() => result.current.pause());

    expect(result.current.remaining).toBe(90);
    expect(result.current.isRunning).toBe(false);

    // Time passing while paused must not consume the timer.
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current.remaining).toBe(90);

    act(() => result.current.resume());
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.remaining).toBe(80);
  });

  it('clears back to idle', () => {
    const { result } = renderHook(() => useCookTimer());
    act(() => result.current.start(60));
    act(() => result.current.clear());

    expect(result.current.isActive).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it('ignores a nonsensical duration', () => {
    const { result } = renderHook(() => useCookTimer());
    act(() => result.current.start(0));
    expect(result.current.isActive).toBe(false);
    act(() => result.current.start(-30));
    expect(result.current.isActive).toBe(false);
  });

  it('starting again replaces the running timer', () => {
    const { result } = renderHook(() => useCookTimer());
    act(() => result.current.start(600));
    act(() => { vi.advanceTimersByTime(60_000); });
    act(() => result.current.start(120));

    expect(result.current.total).toBe(120);
    expect(result.current.remaining).toBe(120);
    expect(result.current.isRunning).toBe(true);
  });

  it('survives a missing AudioContext when it finishes', () => {
    const { result } = renderHook(() => useCookTimer());
    act(() => result.current.start(1));
    expect(() => act(() => { vi.advanceTimersByTime(2_000); })).not.toThrow();
    expect(result.current.isDone).toBe(true);
  });
});
