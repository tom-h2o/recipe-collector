import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeSync } from './ThemeSync';

/**
 * Guards a bug that was invisible from the code: useDarkMode is what puts
 * `dark` on <html>, and it was only ever called from Layout and AuthGate.
 * A guest on a share link or /about renders neither, so every `dark:` class on
 * those pages was dead and the page stayed light on a device set to dark.
 */
function mockPrefersDark(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe('ThemeSync', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('turns on dark mode for a guest whose device asks for it', () => {
    mockPrefersDark(true);
    render(<ThemeSync />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('leaves it light for a guest whose device asks for light', () => {
    mockPrefersDark(false);
    render(<ThemeSync />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('honours a stored preference over the device setting', () => {
    mockPrefersDark(false);
    localStorage.setItem('theme', 'dark');
    render(<ThemeSync />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
