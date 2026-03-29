import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDarkMode } from './useDarkMode';

// Mock matchMedia
const mockMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  mockMatchMedia(false);
});

describe('useDarkMode', () => {
  it('defaults to light when no preference stored and OS is light', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDark).toBe(false);
  });

  it('defaults to dark when OS prefers dark and no stored preference', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDark).toBe(true);
  });

  it('uses stored preference over OS preference', () => {
    mockMatchMedia(true); // OS prefers dark
    localStorage.setItem('theme', 'light');
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDark).toBe(false);
  });

  it('toggle flips isDark', () => {
    const { result } = renderHook(() => useDarkMode());
    const initial = result.current.isDark;
    act(() => result.current.toggle());
    expect(result.current.isDark).toBe(!initial);
  });

  it('toggle persists preference to localStorage', () => {
    const { result } = renderHook(() => useDarkMode());
    act(() => result.current.toggle());
    const stored = localStorage.getItem('theme');
    expect(stored).toBe(result.current.isDark ? 'dark' : 'light');
  });

  it('applies dark class to documentElement when isDark is true', () => {
    localStorage.setItem('theme', 'dark');
    renderHook(() => useDarkMode());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class when isDark is false', () => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'light');
    renderHook(() => useDarkMode());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
