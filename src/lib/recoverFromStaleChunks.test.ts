import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recoverFromStaleChunks } from './recoverFromStaleChunks';

/**
 * A deploy renames every fingerprinted chunk. A browser holding a cached
 * index.html then asks for files that are gone, the lazy import rejects, and
 * the page stays white — the ErrorBoundary never runs, because React has not
 * mounted anything yet.
 */
const reload = vi.fn();

beforeEach(() => {
  reload.mockClear();
  sessionStorage.clear();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    writable: true,
    configurable: true,
  });
});

afterEach(() => { sessionStorage.clear(); });

function failImport(message: string) {
  window.dispatchEvent(
    Object.assign(new Event('unhandledrejection'), { reason: new Error(message) }),
  );
}

describe('recoverFromStaleChunks', () => {
  it('reloads when a lazily imported chunk is missing', () => {
    recoverFromStaleChunks();
    failImport('Failed to fetch dynamically imported module: /assets/RecipeVault-abc123.js');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads on Vite’s own preload error', () => {
    recoverFromStaleChunks();
    window.dispatchEvent(new Event('vite:preloadError'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it.each([
    'Importing a module script failed.',
    'error loading dynamically imported module',
    'Unable to preload CSS for /assets/index-abc.css',
  ])('recognises %s', (message) => {
    recoverFromStaleChunks();
    failImport(message);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads at most once, so a chunk that is really gone cannot loop', () => {
    // The dangerous failure mode: if reloading cannot fix it — a broken deploy,
    // an offline device — an unguarded handler reloads forever.
    recoverFromStaleChunks();
    failImport('Failed to fetch dynamically imported module: /assets/a.js');
    failImport('Failed to fetch dynamically imported module: /assets/b.js');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores ordinary errors', () => {
    recoverFromStaleChunks();
    failImport('TypeError: recipe.title is undefined');
    failImport('NetworkError when attempting to fetch resource.');
    expect(reload).not.toHaveBeenCalled();
  });

  it('allows a fresh reload after a successful load', () => {
    recoverFromStaleChunks();
    failImport('Failed to fetch dynamically imported module: /assets/a.js');
    expect(reload).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('load'));   // the retry rendered
    failImport('Failed to fetch dynamically imported module: /assets/b.js');
    expect(reload).toHaveBeenCalledTimes(2);   // a later deploy gets its own
  });

  it('does nothing when sessionStorage is unavailable', () => {
    // Private browsing can throw on access. Without a marker there is no way
    // to stop a loop, so not reloading is the safe direction.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    recoverFromStaleChunks();
    failImport('Failed to fetch dynamically imported module: /assets/a.js');
    expect(reload).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
