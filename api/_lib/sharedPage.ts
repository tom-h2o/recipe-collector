import * as cheerio from 'cheerio';
import { fetchPublicUrl } from './publicUrl.js';

/**
 * Fetching a recipe page by its link, for the two ways a link arrives: pasted
 * into the app (api/extract.ts), and shared from any app but Safari to the
 * "Speisekammer Web" Shortcut, Instagram's share sheet among them
 * (_lib/shortcutImport.ts, migration 0073). Both get the same answer when a
 * site will not give its page to a server, and the same check on Instagram.
 */

/** A page to read a recipe from: its address and its HTML. */
export interface SharedPage {
  url: string;
  html: string;
}

export interface PageRefusal {
  code: 'site_blocked' | 'page_unavailable';
  site: string;
  error: string;
}

/** Our own name, honestly: no browser is pretended to (see describePageRefusal). */
export const PAGE_REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeCollector/1.0)' };

/** A page that has not arrived by then is not going to; the person hears so instead of waiting. */
const PAGE_TIMEOUT_MS = 15_000;

/**
 * Many recipe sites (rewe.de, edeka.de, chefkoch.de among them) put bot
 * protection in front of their pages: Cloudflare, Akamai or a CDN rule answers
 * a request from a server with 403, or with a challenge only a browser can
 * pass. Nothing here tries to get round that; the answer names the site and
 * says so, and the form offers the ways that do work (pasted text, a PDF or a
 * screenshot). It used to be "Failed to fetch URL: Forbidden".
 */
export function describePageRefusal(url: string, status: number, headers?: { get(name: string): string | null }): PageRefusal {
  const site = siteName(url);
  const blocked = [401, 403, 429, 503].includes(status) || Boolean(headers?.get('cf-mitigated'));
  if (blocked) {
    return {
      code: 'site_blocked',
      site,
      error: `${site} does not let apps read its pages, so this recipe cannot be imported from the link.`,
    };
  }
  return {
    code: 'page_unavailable',
    site,
    error: status === 404 || status === 410
      ? `That page does not exist on ${site} (any more). Check the link.`
      : `${site} did not send the page (error ${status}). Try again later, or paste the recipe as text.`,
  };
}

export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'The website';
  }
}

export function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'instagram.com' || host.endsWith('.instagram.com');
  } catch {
    return false;
  }
}

/**
 * Instagram gives a post's page to a plain request, caption included: in
 * og:description, as `<likes>, <comments> - <account> on <date>: "<caption>"`
 * (the page's visible text is only "Log in / Sign up", since everything else
 * is drawn by script). A post it will not show, private or behind a login
 * wall, comes back as the login page, which has no og:description at all.
 * Told apart here so that costs no AI call and gets a reason of its own.
 */
export function instagramHidesPost(html: string): boolean {
  return !cheerio.load(html)('meta[property="og:description"]').attr('content')?.trim();
}

/** Why a page gave no recipe, in words for the person; an Instagram post says where else it might be. */
export function noRecipeOnPage(url: string): string {
  return isInstagramUrl(url)
    ? 'No recipe was found in this post\'s caption. If it is only in the video, it cannot be read from the link.'
    : 'No recipe was found on this page.';
}

export const INSTAGRAM_HIDDEN = 'Instagram did not show this post to Speisekammer: it may be private, or Instagram asked for a login.';

/** The page behind a link, or why there is none. Not checked: whether it holds a recipe. */
export async function fetchPage(url: string): Promise<{ page: SharedPage } | { refusal: PageRefusal }> {
  try {
    const response = await fetchPublicUrl(url, { headers: PAGE_REQUEST_HEADERS, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    // No AI call has been made, so nothing is logged or counted.
    if (!response.ok) return { refusal: describePageRefusal(url, response.status, response.headers) };
    const html = await response.text();
    if (isInstagramUrl(url) && instagramHidesPost(html)) {
      return { refusal: { code: 'site_blocked', site: 'instagram.com', error: INSTAGRAM_HIDDEN } };
    }
    return { page: { url, html } };
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      const site = siteName(url);
      return { refusal: { code: 'page_unavailable', site, error: `${site} did not answer in time. Try again later, or paste the recipe as text.` } };
    }
    throw err;
  }
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;
const TRACKING_PARAM = /^(utm_[a-z]+|igsh|igshid|fbclid|gclid|mc_cid|mc_eid)$/i;

/** A link without the share-tracking parameters apps add (Instagram's igsh, utm_*, fbclid…). */
export function cleanSharedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) if (TRACKING_PARAM.test(key)) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * The link in whatever a share sheet handed the Shortcut: the address itself,
 * text with an address in it ("Look at this https://…"), or a list of either,
 * of which the first link counts.
 */
export function findSharedUrl(value: unknown): string | null {
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const match = URL_IN_TEXT.exec(item);
    if (!match) continue;
    try {
      return cleanSharedUrl(new URL(match[0].replace(/[.,;:!?)\]]+$/, '')).toString());
    } catch {
      continue;
    }
  }
  return null;
}
