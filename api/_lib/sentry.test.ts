import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The server's Sentry wiring. What matters most is the part nothing else
 * would notice: on Vercel a function may be frozen as soon as it answers, so
 * an error that is captured but not flushed never arrives.
 */
const h = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  waitUntil: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  init: h.init,
  captureException: h.captureException,
  flush: h.flush,
  consoleLoggingIntegration: (options: unknown) => ({ name: 'ConsoleLogs', options }),
}));
vi.mock('@vercel/functions', () => ({ waitUntil: h.waitUntil }));

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import('./sentry');
}

describe('server Sentry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('does nothing at all without SENTRY_DSN', async () => {
    const { captureException } = await load({ SENTRY_DSN: '' });
    captureException(new Error('x'));
    expect(h.init).not.toHaveBeenCalled();
    expect(h.captureException).not.toHaveBeenCalled();
    expect(h.waitUntil).not.toHaveBeenCalled();
  });

  it('starts at import, so console logging is in place before an endpoint logs', async () => {
    await load({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/2', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: 'abc' });
    expect(h.init).toHaveBeenCalledWith(expect.objectContaining({ environment: 'production', release: 'abc', tracesSampleRate: 0.1 }));
  });

  it('keeps the function alive until the error has been sent', async () => {
    const { captureException } = await load({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/2' });
    const err = new Error('boom');
    captureException(err);

    expect(h.captureException).toHaveBeenCalledWith(err);
    expect(h.waitUntil).toHaveBeenCalledTimes(1);
    // The flush runs on the next turn, after the endpoint's own console.error.
    expect(h.flush).not.toHaveBeenCalled();
    await h.waitUntil.mock.calls[0][0];
    expect(h.flush).toHaveBeenCalledWith(2000);
  });

  it('never fails the request when waitUntil cannot be used', async () => {
    const { captureException } = await load({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/2' });
    h.waitUntil.mockImplementationOnce(() => { throw new Error('no request context'); });
    expect(() => captureException(new Error('x'))).not.toThrow();
  });

  it('sends warnings and errors as logs, and every trace outside production', async () => {
    const { serverSentryOptions } = await load({ SENTRY_DSN: '' });
    const options = serverSentryOptions('dsn', { VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv);
    expect(options.tracesSampleRate).toBe(1.0);
    expect(options.environment).toBe('preview');
    expect(options.integrations).toEqual([{ name: 'ConsoleLogs', options: { levels: ['warn', 'error'] } }]);
    expect(options.dataCollection).toMatchObject({ httpHeaders: false, httpBodies: [], stackFrameVariables: false });
  });
});
