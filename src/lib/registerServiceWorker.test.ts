import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerServiceWorker } from './registerServiceWorker';

/**
 * These cover the three reasons a phone kept showing an old build. Each one is
 * invisible in normal use — the app works, it is just the previous version —
 * so nothing else would catch a regression here.
 */

type Listener = (e?: unknown) => void;

function setupSW({ hasController }: { hasController: boolean }) {
  const listeners: Record<string, Listener[]> = {};
  const update = vi.fn().mockResolvedValue(undefined);
  const register = vi.fn().mockResolvedValue({ update });

  const sw = {
    controller: hasController ? {} : null,
    register,
    addEventListener: (type: string, fn: Listener) => {
      (listeners[type] ??= []).push(fn);
    },
  };
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
  return { listeners, register, update };
}

const windowListeners: Record<string, Listener[]> = {};
const reload = vi.fn();

beforeEach(() => {
  for (const k of Object.keys(windowListeners)) delete windowListeners[k];
  reload.mockClear();
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject) => {
    (windowListeners[type] ??= []).push(fn as Listener);
  });
  Object.defineProperty(window, 'location', { value: { reload }, configurable: true });
});

afterEach(() => vi.restoreAllMocks());

async function fireLoad() {
  for (const fn of windowListeners['load'] ?? []) fn();
  await Promise.resolve();
  await Promise.resolve();
}

describe('registerServiceWorker', () => {
  it('bypasses the HTTP cache when fetching the worker script', async () => {
    // Without this the browser may serve /sw.js from its own cache for up to a
    // day and compare the new worker against a stale copy, finding no change.
    const { register } = setupSW({ hasController: true });
    registerServiceWorker();
    await fireLoad();
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  });

  it('re-checks for a new worker when the app becomes visible again', async () => {
    // An installed PWA resumed from the app switcher never fires `load` again,
    // which is exactly the phone case.
    const { update } = setupSW({ hasController: true });
    registerServiceWorker();
    await fireLoad();
    update.mockClear();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalled();
  });

  it('does not re-check while the app is hidden', async () => {
    const { update } = setupSW({ hasController: true });
    registerServiceWorker();
    await fireLoad();
    update.mockClear();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).not.toHaveBeenCalled();
  });

  it('reloads once when a new worker takes over an already-controlled page', () => {
    // clientsClaim() hands the open page to the new worker, but that page still
    // runs the JavaScript it already parsed. Without this reload the user keeps
    // seeing the old build until they close the app entirely.
    const { listeners } = setupSW({ hasController: true });
    registerServiceWorker();

    listeners['controllerchange'][0]();
    expect(reload).toHaveBeenCalledTimes(1);

    listeners['controllerchange'][0]();
    expect(reload).toHaveBeenCalledTimes(1); // guarded against a reload loop
  });

  it('does not reload on a first visit, when there was no controller yet', () => {
    // Installing for the first time also fires controllerchange. Reloading there
    // would make every new visitor bounce once for no reason.
    const { listeners } = setupSW({ hasController: false });
    registerServiceWorker();

    listeners['controllerchange'][0]();
    expect(reload).not.toHaveBeenCalled();
  });
});
