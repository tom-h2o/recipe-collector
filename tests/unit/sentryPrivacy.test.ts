import { describe, expect, it } from 'vitest';
import {
  BROWSER_DATA_COLLECTION, SERVER_DATA_COLLECTION, scrubBreadcrumb, scrubEvent, scrubSpan, withoutFragment,
} from '../../shared/sentryPrivacy';

/**
 * What the Sentry SDKs may send (shared/sentryPrivacy.ts). Since v11 an unset
 * `dataCollection` collects everything, so each of these is a line that keeps
 * recipes, photos, prompts, keys and sessions out of Sentry.
 */
const SESSION = '#access_token=eyJ.secret&refresh_token=r1&type=magiclink';

describe('what Sentry may collect', () => {
  it.each([
    ['browser', BROWSER_DATA_COLLECTION],
    ['server', SERVER_DATA_COLLECTION],
  ])('%s: no bodies, user details, cookies, AI text, query data or local variables', (_side, collection) => {
    expect(collection.httpBodies).toEqual([]);
    expect(collection.userInfo).toBe(false);
    expect(collection.cookies).toBe(false);
    expect(collection.genAI).toEqual({ inputs: false, outputs: false });
    expect(collection.databaseQueryData).toBe(false);
    expect(collection.stackFrameVariables).toBe(false);
  });

  it('the server sends no headers (the Shortcut key is one) and no query parameters (the share token is one)', () => {
    expect(SERVER_DATA_COLLECTION.httpHeaders).toBe(false);
    expect(SERVER_DATA_COLLECTION.urlQueryParams).toBe(false);
  });
});

describe('the sign-in Supabase puts in the address', () => {
  it('is cut off a URL, and nothing else is', () => {
    expect(withoutFragment(`https://app.example/${SESSION}`)).toBe('https://app.example/');
    expect(withoutFragment('https://app.example/r/abc?x=1')).toBe('https://app.example/r/abc?x=1');
  });

  it('never reaches an error event or its breadcrumbs', () => {
    const event = scrubEvent({
      request: { url: `https://app.example/${SESSION}` },
      breadcrumbs: [{ category: 'navigation', data: { from: `/${SESSION}`, to: '/settings' } }],
    });
    expect(JSON.stringify(event)).not.toContain('access_token');
    expect(event.request?.url).toBe('https://app.example/');
    expect(event.breadcrumbs?.[0].data).toEqual({ from: '/', to: '/settings' });
  });

  it('never reaches a fetch breadcrumb', () => {
    expect(scrubBreadcrumb({ category: 'fetch', data: { url: `/api/x${SESSION}`, method: 'GET' } }).data)
      .toEqual({ url: '/api/x', method: 'GET' });
  });

  it('never reaches a page-load span', () => {
    const span = scrubSpan({
      name: `/${SESSION}`,
      attributes: { 'url.full': `https://app.example/${SESSION}`, 'url.fragment': SESSION.slice(1), 'sentry.op': 'pageload' },
    });
    expect(JSON.stringify(span)).not.toContain('access_token');
    expect(span.attributes).toEqual({ 'url.full': 'https://app.example/', 'sentry.op': 'pageload' });
  });
});
