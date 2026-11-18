import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServerSupabase } from './_lib/supabase.js';

/**
 * Link previews for public share links.
 *
 * A share link is pasted into WhatsApp, Signal or Slack far more often than it
 * is typed. Those crawlers do not run JavaScript, so they saw only the SPA
 * shell's static tags and rendered a bare URL — no title, no photo. For a
 * feature whose entire surface is a link, that is the first impression.
 *
 * Only crawlers reach this handler: vercel.json routes /r/* here just for
 * user agents that are known preview bots, and everyone else falls through to
 * the SPA. That keeps the page itself a pure client-side render and means a
 * fault here cannot stop a person opening the link.
 */

/** Escapes text for use inside a double-quoted HTML attribute. */
export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Trims a description to something a preview card will actually show. */
export function truncate(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export interface PreviewRecipe {
  title: string;
  description: string | null;
  image_url: string | null;
  servings: number | null;
  prep_time_mins: number | null;
  cook_time_mins: number | null;
}

/**
 * The preview document.
 *
 * noindex is deliberate: a share link is meant for the person it was sent to,
 * not for search results. It does not stop a messenger drawing a card — those
 * crawlers read the tags regardless — it stops the recipe turning up in a
 * stranger's search for it.
 */
export function buildPreviewHtml(recipe: PreviewRecipe, canonicalUrl: string, appName: string): string {
  const title = escapeAttribute(recipe.title);
  const parts = [
    recipe.description ? truncate(recipe.description) : '',
    recipe.servings ? `Serves ${recipe.servings}.` : '',
    (recipe.prep_time_mins || recipe.cook_time_mins)
      ? `${(recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0)} min.`
      : '',
  ].filter(Boolean);
  const description = escapeAttribute(
    truncate(parts.join(' ') || `A recipe shared from ${appName}.`),
  );
  const url = escapeAttribute(canonicalUrl);
  const image = recipe.image_url ? escapeAttribute(recipe.image_url) : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta name="robots" content="noindex" />
<meta name="description" content="${description}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${escapeAttribute(appName)}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${url}" />
${image ? `<meta property="og:image" content="${image}" />\n<meta name="twitter:image" content="${image}" />` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<link rel="canonical" href="${url}" />
</head>
<body>
<h1>${title}</h1>
<p>${description}</p>
<p><a href="${url}">Open this recipe</a></p>
</body>
</html>`;
}

const APP_NAME = 'Speisekammer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawToken = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  const token = (rawToken ?? '').trim();

  // A preview is decoration. Anything unexpected sends the crawler to the real
  // page rather than failing, so a bad link never looks like a broken site.
  const origin = process.env.ALLOWED_ORIGIN || `https://${req.headers.host ?? ''}`;
  const canonical = `${origin}/r/${encodeURIComponent(token)}`;

  if (!token) {
    res.setHeader('Location', origin || '/');
    return res.status(302).end();
  }

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase.rpc('get_shared_recipe', { p_token: token });
    const row = Array.isArray(data) ? data[0] : null;

    if (error || !row) {
      res.setHeader('Location', canonical);
      return res.status(302).end();
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Short cache: the owner can revoke at any moment, and a preview that
    // outlives the link is the one thing worse than no preview.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, must-revalidate');
    return res.status(200).send(buildPreviewHtml(row as PreviewRecipe, canonical, APP_NAME));
  } catch {
    res.setHeader('Location', canonical);
    return res.status(302).end();
  }
}
