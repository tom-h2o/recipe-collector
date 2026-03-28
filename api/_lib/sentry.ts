import * as Sentry from '@sentry/node';

let initialised = false;

function ensureInit(): void {
  if (initialised) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0.1 });
  initialised = true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function captureException(err: any): void {
  ensureInit();
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
}
