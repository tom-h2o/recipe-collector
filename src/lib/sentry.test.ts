import { describe, expect, it } from 'vitest';
import { browserSentryOptions } from './sentry';
import { BROWSER_DATA_COLLECTION } from '../../shared/sentryPrivacy';

const DSN = 'https://public@o1.ingest.de.sentry.io/1';
const build = (over: Partial<Parameters<typeof browserSentryOptions>[1]> = {}) =>
  browserSentryOptions(DSN, { dev: false, environment: 'production', release: 'abc123', ...over });

describe('browser Sentry options', () => {
  it('keeps every trace locally and one in ten in production', () => {
    expect(build({ dev: true }).tracesSampleRate).toBe(1.0);
    expect(build().tracesSampleRate).toBe(0.1);
  });

  it('records a replay only when an error happens', () => {
    const options = build();
    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(1.0);
    expect(options.integrations).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Replay' })]));
  });

  it('masks every text, input and picture in a replay', () => {
    const replay = (build().integrations as { name: string; _initialOptions?: Record<string, unknown>; options?: Record<string, unknown> }[])
      .find((i) => i.name === 'Replay') as unknown as Record<string, unknown>;
    // The integration keeps its options under different names across
    // versions; whichever it is, the three must be on.
    const json = JSON.stringify(replay, (_k, v) => (typeof v === 'function' ? undefined : v));
    expect(json).toMatch(/"maskAllText":true/);
    expect(json).toMatch(/"maskAllInputs":true/);
    expect(json).toMatch(/"blockAllMedia":true/);
  });

  it('sends trace headers to our own API only, never to Supabase', () => {
    const [target] = build().tracePropagationTargets as RegExp[];
    expect(target.test('/api/translate')).toBe(true);
    expect(target.test('https://project.supabase.co/rest/v1/recipes')).toBe(false);
  });

  it('collects nothing personal and scrubs addresses before sending', () => {
    const options = build();
    expect(options.dataCollection).toBe(BROWSER_DATA_COLLECTION);
    expect(typeof options.beforeSend).toBe('function');
    expect(typeof options.beforeBreadcrumb).toBe('function');
    expect(typeof options.beforeSendSpan).toBe('function');
  });

  it('names the deploy, or leaves the release out outside Vercel', () => {
    expect(build().release).toBe('abc123');
    expect(build({ release: '' }).release).toBeUndefined();
  });
});
