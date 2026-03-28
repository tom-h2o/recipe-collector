import * as Sentry from '@sentry/react';

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // no-op in dev if DSN not set

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE,
    tracesSampleRate: 0.2,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

export { Sentry };
