import * as Sentry from '@sentry/node';
import { waitUntil } from '@vercel/functions';
import { SERVER_DATA_COLLECTION } from '../../shared/sentryPrivacy.js';

/** production / preview on Vercel, else NODE_ENV, else development. */
function environment(env: NodeJS.ProcessEnv): string {
  return env.VERCEL_ENV || env.NODE_ENV || 'development';
}

/**
 * The server SDK's options, for the speisekammer-server project. A function of
 * the environment so the choices can be tested without starting Sentry.
 *
 * - Errors, reported by captureException() below from every endpoint's catch.
 * - Logs: console.warn and console.error, which is where every endpoint
 *   already says what went wrong. They can quote parts of a recipe; Sentry's
 *   data scrubber still runs on them.
 * - Tracing: every trace outside production, one in ten in production.
 * - Nothing personal, no headers, no query parameters, no local variables
 *   (shared/sentryPrivacy.ts): request bodies are recipes and photos, and the
 *   Shortcut's key travels in a header.
 */
export function serverSentryOptions(dsn: string, env: NodeJS.ProcessEnv = process.env): Sentry.NodeOptions {
  const name = environment(env);
  return {
    dsn,
    environment: name,
    release: env.VERCEL_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: name === 'production' ? 0.1 : 1.0,
    dataCollection: SERVER_DATA_COLLECTION,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })],
  };
}

// At import rather than on the first error, so the console logging is in
// place before an endpoint logs anything. Every endpoint imports this file.
const dsn = process.env.SENTRY_DSN;
if (dsn) Sentry.init(serverSentryOptions(dsn));

/**
 * Reports an error, and makes sure it is sent.
 *
 * The SDK sends in the background, and Vercel may freeze a function as soon
 * as it has answered: an event still waiting then is lost. waitUntil keeps the
 * function alive until the flush is done. The flush starts on the next turn,
 * so the console.error each endpoint writes right after this call is part of
 * the same batch. Outside Vercel waitUntil does nothing and the promise simply
 * runs.
 */
export function captureException(err: unknown): void {
  if (!dsn) return;
  Sentry.captureException(err);
  const flushed = new Promise((resolve) => setTimeout(resolve, 0)).then(() => Sentry.flush(2000));
  try {
    waitUntil(flushed);
  } catch {
    // Reporting must never fail the request it reports on.
  }
}
