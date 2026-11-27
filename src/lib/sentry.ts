import * as Sentry from '@sentry/react';
import {
  BROWSER_DATA_COLLECTION, scrubBreadcrumb, scrubEvent, scrubSpan,
} from '../../shared/sentryPrivacy';

interface BuildInfo {
  /** Development build (`vite dev`): every trace is kept. */
  dev: boolean;
  /** production / preview / development: VITE_APP_ENV, else Vercel's VERCEL_ENV at build time, else Vite's mode. */
  environment: string;
  /** The commit, so an error names the deploy it came from. Empty outside Vercel. */
  release: string;
}

/**
 * The browser SDK's options. A function of the build, so the choices can be
 * tested without starting Sentry (src/lib/sentry.test.ts).
 *
 * - Errors, with stack traces that the build's source maps make readable
 *   (vite.config.ts uploads them when SENTRY_AUTH_TOKEN is set).
 * - Tracing: every trace locally, one in ten in production. Trace headers go
 *   only to our own /api functions, never to Supabase or anyone else.
 * - Session Replay only when an error happens (the last minute before it), with
 *   every text, input and picture masked: no recipe, note or address appears.
 * - Nothing personal collected (shared/sentryPrivacy.ts), and the sign-in that
 *   Supabase puts in the address after a magic link stripped from every URL.
 */
export function browserSentryOptions(dsn: string, build: BuildInfo): Sentry.BrowserOptions {
  return {
    dsn,
    environment: build.environment,
    release: build.release || undefined,
    tracesSampleRate: build.dev ? 1.0 : 0.1,
    tracePropagationTargets: [/^\/api\//],
    dataCollection: BROWSER_DATA_COLLECTION,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    beforeSendSpan: (span) => scrubSpan(span),
  };
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // no-op in dev if DSN not set

  Sentry.init(browserSentryOptions(dsn, {
    dev: import.meta.env.DEV,
    environment: import.meta.env.VITE_APP_ENV || __SENTRY_ENVIRONMENT__ || import.meta.env.MODE,
    release: __SENTRY_RELEASE__,
  }));
}

/**
 * React 19's error hooks, for createRoot in main.tsx. Without them an error
 * that an error boundary catches (the app's own, which shows LoadFailure) is
 * handled and never reported. Each still logs to the console as React does by
 * default, since passing a hook replaces that.
 */
export const reactRootErrorHooks = {
  onUncaughtError: Sentry.reactErrorHandler((error, info) => console.error(error, info.componentStack)),
  onCaughtError: Sentry.reactErrorHandler((error, info) => console.error(error, info.componentStack)),
  onRecoverableError: Sentry.reactErrorHandler((error) => console.error(error)),
};

export { Sentry };
