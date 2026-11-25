import { afterEach, describe, expect, it, vi } from 'vitest';
import { INSTAGRAM_LOGIN_HTML, PUMPKIN_CAPTION, instagramPostHtml } from './testFixtures/instagram';

/**
 * A link's page, fetched by the server: the same for a link pasted into the
 * app and one sent by the link Shortcut. Instagram gives a public post's
 * caption to a plain request, in og:description; a hidden post comes back as
 * the login page, and must be told apart before any AI call.
 */

const fetchPublicUrl = vi.hoisted(() => vi.fn());
vi.mock('./publicUrl.js', () => ({ fetchPublicUrl }));

import {
  INSTAGRAM_HIDDEN, cleanSharedUrl, fetchPage, findSharedUrl, instagramHidesPost, isInstagramUrl, noRecipeOnPage,
} from './sharedPage';

const page = (html: string, status = 200, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  text: async () => html,
});

afterEach(() => fetchPublicUrl.mockReset());

describe('the link in what a share sheet hands over', () => {
  it('takes the address, or the first one in some text or a list', () => {
    expect(findSharedUrl('https://www.instagram.com/reel/DAbc123xyz/')).toBe('https://www.instagram.com/reel/DAbc123xyz/');
    expect(findSharedUrl('Schau mal: https://example.com/rezept/suppe. Lecker!')).toBe('https://example.com/rezept/suppe');
    expect(findSharedUrl(['Kürbissuppe', 'https://example.com/a', 'https://example.com/b'])).toBe('https://example.com/a');
  });

  it('finds nothing where there is no web link', () => {
    expect(findSharedUrl('')).toBeNull();
    expect(findSharedUrl('just some words')).toBeNull();
    expect(findSharedUrl('javascript:alert(1)')).toBeNull();
    expect(findSharedUrl({ url: 'https://example.com' })).toBeNull();
    expect(findSharedUrl(undefined)).toBeNull();
  });

  it('drops the tracking a share adds, and keeps every other parameter', () => {
    expect(findSharedUrl('https://www.instagram.com/reel/DAbc123xyz/?igsh=MWZ0dXl5&utm_source=ig_web_copy_link'))
      .toBe('https://www.instagram.com/reel/DAbc123xyz/');
    expect(cleanSharedUrl('https://example.com/r?id=7&fbclid=abc&utm_medium=social')).toBe('https://example.com/r?id=7');
    expect(cleanSharedUrl('not a url')).toBe('not a url');
  });
});

describe('Instagram', () => {
  it('is recognised on any of its hosts, and nothing else is', () => {
    expect(isInstagramUrl('https://www.instagram.com/p/x/')).toBe(true);
    expect(isInstagramUrl('https://instagram.com/reel/x/')).toBe(true);
    expect(isInstagramUrl('https://notinstagram.com/p/x/')).toBe(false);
    expect(isInstagramUrl('https://example.com/?u=instagram.com')).toBe(false);
  });

  it('shows a public post with its caption, and hides one behind the login page', () => {
    expect(instagramHidesPost(instagramPostHtml(PUMPKIN_CAPTION))).toBe(false);
    expect(instagramHidesPost(INSTAGRAM_LOGIN_HTML)).toBe(true);
  });

  it('says where else the recipe might be when the caption has none', () => {
    expect(noRecipeOnPage('https://www.instagram.com/reel/x/')).toContain('only in the video');
    expect(noRecipeOnPage('https://example.com/about')).toBe('No recipe was found on this page.');
  });
});

describe('fetchPage', () => {
  it('returns the page of a public post, asking with our own name', async () => {
    fetchPublicUrl.mockResolvedValue(page(instagramPostHtml(PUMPKIN_CAPTION)));
    const result = await fetchPage('https://www.instagram.com/p/DAbc123xyz/');
    expect(result).toEqual({ page: { url: 'https://www.instagram.com/p/DAbc123xyz/', html: expect.stringContaining('Hokkaido') } });
    const [, init] = fetchPublicUrl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('RecipeCollector');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('refuses a post Instagram hides, as a blocked site', async () => {
    fetchPublicUrl.mockResolvedValue(page(INSTAGRAM_LOGIN_HTML));
    expect(await fetchPage('https://www.instagram.com/p/private/')).toEqual({
      refusal: { code: 'site_blocked', site: 'instagram.com', error: INSTAGRAM_HIDDEN },
    });
  });

  it('applies the login-page rule to Instagram only', async () => {
    fetchPublicUrl.mockResolvedValue(page('<html><body>Kürbissuppe: 1 Hokkaido, kochen.</body></html>'));
    expect(await fetchPage('https://example.com/suppe')).toHaveProperty('page');
  });

  it('names a site that refuses servers', async () => {
    fetchPublicUrl.mockResolvedValue(page('Just a moment…', 403, { 'cf-mitigated': 'challenge' }));
    expect(await fetchPage('https://www.rewe.de/rezepte/x/')).toEqual({
      refusal: { code: 'site_blocked', site: 'rewe.de', error: expect.stringContaining('rewe.de does not let apps read its pages') },
    });
  });

  it('turns a page that never comes into a reason, not an error', async () => {
    fetchPublicUrl.mockRejectedValue(Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' }));
    expect(await fetchPage('https://slow.example/r')).toEqual({
      refusal: { code: 'page_unavailable', site: 'slow.example', error: expect.stringContaining('did not answer in time') },
    });
  });

  it('lets a refused address through as the error it is', async () => {
    fetchPublicUrl.mockRejectedValue(new Error('Private or local network URLs cannot be imported.'));
    await expect(fetchPage('http://10.0.0.1/')).rejects.toThrow('Private or local');
  });
});
