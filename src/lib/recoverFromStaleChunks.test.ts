import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  recoverFromStaleChunks, recoveryInProgress, resetRecoveryForTests, RECOVERY_WINDOW_MS,
} from './recoverFromStaleChunks';

/**
 * A deploy renames every fingerprinted chunk. A browser holding a cached
 * index.html then asks for files that are gone and the lazy view never
 * arrives. One reload normally fixes it. These tests are mostly about the
 * word "one".
 */
const reload = vi.fn();

/** A page load: listeners and module state start again, sessionStorage does not. */
function newPageLoad() {
  resetRecoveryForTests();
  recoverFromStaleChunks();
}

beforeEach(() => {
  reload.mockClear();
  sessionStorage.clear();
  resetRecoveryForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

function failImport(message: string) {
  window.dispatchEvent(
    Object.assign(new Event('unhandledrejection'), { reason: new Error(message) }),
  );
}

describe('recoverFromStaleChunks', () => {
  it('reloads when a lazily imported chunk is missing', () => {
    newPageLoad();
    failImport('Failed to fetch dynamically imported module: /assets/RecipeVault-abc123.js');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(recoveryInProgress()).toBe(true);
  });

  it('reloads on Vite’s own preload error', () => {
    newPageLoad();
    window.dispatchEvent(new Event('vite:preloadError'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves Vite’s error alone, so the real one reaches the screen', () => {
    // preventDefault() makes Vite resolve the import with `undefined`; React
    // then reports "Cannot read properties of undefined" and the name of the
    // file that failed is lost.
    newPageLoad();
    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([
    'Importing a module script failed.',
    'error loading dynamically imported module',
    'Unable to preload CSS for /assets/index-abc.css',
    // What the SPA rewrite produces: a missing chunk answered with index.html.
    'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
  ])('recognises %s', (message) => {
    newPageLoad();
    failImport(message);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores ordinary errors', () => {
    newPageLoad();
    failImport('TypeError: recipe.title is undefined');
    failImport('NetworkError when attempting to fetch resource.');
    expect(reload).not.toHaveBeenCalled();
  });

  describe('a chunk that can never load', () => {
    it('does not reload again after the reload it caused', () => {
      newPageLoad();
      failImport('Failed to fetch dynamically imported module: /assets/a.js');
      expect(reload).toHaveBeenCalledTimes(1);

      newPageLoad();                                            // the reload lands
      failImport('Failed to fetch dynamically imported module: /assets/a.js');
      expect(reload).toHaveBeenCalledTimes(1);
      expect(recoveryInProgress()).toBe(false);                 // so the failure screen shows
    });

    it('is not re-armed by the window load event', () => {
      // THE regression. The first version cleared its marker on `load`, taking
      // "the page loaded" for "the retry worked". But `load` fires before a
      // lazy chunk is even requested, so every reload re-armed the next one:
      // 352 reloads in 20 seconds, measured against a real browser.
      newPageLoad();
      failImport('Failed to fetch dynamically imported module: /assets/a.js');

      for (let i = 0; i < 25; i++) {
        newPageLoad();
        window.dispatchEvent(new Event('load'));
        failImport('Failed to fetch dynamically imported module: /assets/a.js');
        window.dispatchEvent(new Event('vite:preloadError'));
      }
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('reloads once however many chunks fail at the same moment', () => {
      newPageLoad();
      failImport('Failed to fetch dynamically imported module: /assets/a.js');
      failImport('Failed to fetch dynamically imported module: /assets/b.js');
      window.dispatchEvent(new Event('vite:preloadError'));
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it('gives a later deploy its own reload once the window has passed', () => {
    newPageLoad();
    failImport('Failed to fetch dynamically imported module: /assets/a.js');
    expect(reload).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(RECOVERY_WINDOW_MS - 1000);
    newPageLoad();
    failImport('Failed to fetch dynamically imported module: /assets/b.js');
    expect(reload).toHaveBeenCalledTimes(1);                    // still inside it

    vi.advanceTimersByTime(2000);
    newPageLoad();
    failImport('Failed to fetch dynamically imported module: /assets/c.js');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does nothing when sessionStorage cannot be written', () => {
    // Private browsing can throw on access. With nowhere to remember the
    // attempt there is no way to stop a loop, so not reloading is the safe side.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    newPageLoad();
    failImport('Failed to fetch dynamically imported module: /assets/a.js');
    expect(reload).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does nothing when sessionStorage cannot be read', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    newPageLoad();
    failImport('Failed to fetch dynamically imported module: /assets/a.js');
    expect(reload).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
