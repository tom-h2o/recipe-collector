import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoogleGenAI } from '@google/genai';
import { waitUntil as vercelWaitUntil } from '@vercel/functions';
import { ZodError } from 'zod';
import { getServerSupabase, getSettings, resolveApiKey, type Settings } from './supabase.js';
import { getGeminiClient, describeGeminiError } from './gemini.js';
import { captureException } from './sentry.js';
import { checkRateLimit } from './rateLimit.js';
import { MAX_EXTRACT_PHOTOS } from './schemas.js';
import { extractRecipeFromImages } from './photoExtraction.js';
import { DailyLimitError, estimateNutrition, tagRecipe, type RecipeText } from './enrich.js';
import { decodeBase64, imageSize, sniffImageType, splitBase64Images, type SupportedImageType } from './imageBytes.js';
import { decideKind, type ImageKind } from '../../shared/imageKind.js';
import { SAFARI_SHORTCUT_NAME } from '../../shared/safariShortcut.js';
import { extractRecipeFromHtml } from './pageExtraction.js';
import { cleanSharedUrl, fetchPage, findSharedUrl, isInstagramUrl, noRecipeOnPage, type PageRefusal, type SharedPage } from './sharedPage.js';

export type { SharedPage };

/**
 * Recipes sent from the iPhone's Photos app, through an Apple Shortcut.
 *
 * Safari does not support the Web Share Target API, so a web app cannot sit in
 * the iPhone's share sheet. A Shortcut can: it takes the selected pictures,
 * base64-encodes them and POSTs them to /api/extract?via=shortcut with the
 * person's key in the X-Speisekammer-Key header. Here they are read (one
 * recipe across all pages, or one per picture), saved to that person's vault
 * with the pictures attached, and tagged and estimated like any new recipe.
 *
 * The answer comes as soon as the pictures have arrived and the import is
 * recorded: "Got it", and the reading finishes in the background (Vercel's
 * waitUntil). It used to wait up to 20 seconds for the reading, to say
 * "Saved: <title>" instead, which left the iPhone hanging on a spinner for
 * most of that time; the result was going to be in the app anyway. Each
 * recipe has a recipe_imports row (migration 0070), which the app turns into
 * its "new recipes from your iPhone" banner and New badges, including the
 * ones that could not be read. (Shortcuts also gives up on a request after
 * about 30 seconds, which a slow read on several pages could exceed.)
 *
 * Every answer is `{ message }`, worded for the person: the Shortcut shows it
 * as a notification as it is.
 *
 * The same address takes a web page from the Safari Shortcut ("Save page to
 * Speisekammer", migration 0072): `{ page }`, where page is the JSON text
 * `{ url, html }` that SAFARI_SHORTCUT_SCRIPT returns from "Run JavaScript on
 * Web Page". Sites such as rewe.de refuse their pages to servers, so a pasted
 * link cannot be imported; the page the person has open in Safari can be.
 * It is read like a link (extractRecipeFromHtml) and saved with its address.
 *
 * And a link from any app's share sheet, from the "Send link to Speisekammer"
 * Shortcut (migration 0073): `{ url }`. Made for Instagram, whose share
 * button hands over the post's address and nothing else, but any app's link
 * works. Here the server fetches the page, as for a link pasted into the app
 * (sharedPage.ts), before answering: a site that refuses servers, or an
 * Instagram post Instagram will not show, is said in the notification, with
 * the Safari Shortcut as the way round, and nothing is recorded.
 */

export const SHORTCUT_KEY_HEADER = 'x-speisekammer-key';
const KEY_PREFIX = 'spk_';

/**
 * How long the Shortcut waits for the reading before it hears "Got it": not
 * at all. Tests pass a longer wait to check the "Saved: <title>" path, which
 * stays for any caller that wants it.
 */
export const REPLY_WITHIN_MS = 0;

/** Base64 is a third larger than the bytes; Vercel refuses bodies over 4.5 MB. */
const MAX_TOTAL_BASE64 = 4_400_000;

/** Two recipes are read at once when several are sent as one per picture. */
const PARALLEL_IMPORTS = 2;

/** A new key: shown once, stored only as its hash. */
export function newShortcutKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashShortcutKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** The person a key belongs to, or null. Notes when it was last used. */
export async function userForShortcutKey(supabase: SupabaseClient, key: string): Promise<string | null> {
  if (!key.startsWith(KEY_PREFIX) || key.length < 20) return null;
  const { data, error } = await supabase
    .from('shortcut_keys')
    .select('user_id')
    .eq('key_hash', hashShortcutKey(key))
    .maybeSingle();
  if (error || !data) return null;
  void supabase.from('shortcut_keys').update({ last_used_at: new Date().toISOString() }).eq('user_id', data.user_id).then(() => {}, () => {});
  return data.user_id as string;
}

interface Picture {
  base64: string;
  bytes: Uint8Array;
  type: SupportedImageType;
}

async function readMeta(bytes: Uint8Array): Promise<Record<string, unknown> | null> {
  try {
    // The package's main entry (typed, and traced by Vercel's bundler); the
    // browser loads the smaller lite build instead (src/lib/imageKind.ts).
    // Plain Node resolves its UMD build, which has only a default export;
    // Vite and Vitest resolve its ESM build, which has named ones too.
    const mod = await import('exifr');
    const parse = (mod.parse as typeof mod.parse | undefined) ?? mod.default.parse;
    const meta: unknown = await parse(bytes);
    return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Photo or screenshot, by the rules the browser uses (shared/imageKind.ts). */
export async function kindOfPictures(pictures: Picture[]): Promise<ImageKind> {
  const kinds = await Promise.all(pictures.map(async (p) => decideKind({
    type: p.type,
    meta: await readMeta(p.bytes),
    size: imageSize(p.bytes, p.type),
  })));
  return kinds.includes('photo') ? 'photo' : 'screenshot';
}

/** What one recipe came to. */
export type ImportOutcome = { status: 'saved'; title: string; recipeId: string } | { status: 'failed'; error: string };

function failureMessage(err: unknown, what: 'picture' | 'page' = 'picture', pageUrl = ''): string {
  // extractedRecipeSchema refused the answer: no title, no ingredients or no method.
  if (err instanceof ZodError) return what === 'page' ? noRecipeOnPage(pageUrl) : 'No recipe could be read from this picture.';
  if (err instanceof DailyLimitError) return 'Today\'s AI allowance is used up. Send it again tomorrow.';
  return describeGeminiError(err, `The ${what} could not be read just now. Please send it again later.`).message;
}

interface ImportContext {
  supabase: SupabaseClient;
  client: GoogleGenAI;
  settings: Settings;
  userId: string;
}

async function storePictures(supabase: SupabaseClient, pictures: Picture[]): Promise<{ url: string; storagePath: string }[]> {
  const stored: { url: string; storagePath: string }[] = [];
  for (const picture of pictures) {
    const storagePath = `${randomUUID()}.${picture.type.split('/')[1].replace('jpeg', 'jpg')}`;
    const { error } = await supabase.storage
      .from('recipe-images')
      .upload(storagePath, picture.bytes, { contentType: picture.type, upsert: false });
    if (error) throw new Error(`The picture could not be stored: ${error.message}`);
    stored.push({ url: supabase.storage.from('recipe-images').getPublicUrl(storagePath).data.publicUrl, storagePath });
  }
  return stored;
}

/**
 * One recipe from one group of pictures: read, saved with its pictures,
 * tagged and estimated, and its import row finished either way.
 */
function finishImport(supabase: SupabaseClient, importId: string, fields: Record<string, unknown>) {
  return supabase.from('recipe_imports').update({ ...fields, finished_at: new Date().toISOString() }).eq('id', importId).then(() => {}, () => {});
}

/** Tags and nutrition, as the app asks for after every save. Neither may undo the import. */
async function enrichSaved(ctx: ImportContext, recipe: RecipeText): Promise<void> {
  const enriched = await Promise.allSettled([tagRecipe(ctx, recipe), estimateNutrition(ctx, recipe)]);
  for (const r of enriched) if (r.status === 'rejected') console.warn('Shortcut import: enrichment failed', r.reason);
}

export async function importOne(ctx: ImportContext, pictures: Picture[], importId: string): Promise<ImportOutcome> {
  const { supabase, userId } = ctx;
  const finish = (fields: Record<string, unknown>) => finishImport(supabase, importId, fields);
  try {
    const rl = await checkRateLimit(supabase, userId);
    if (!rl.allowed) throw new DailyLimitError(rl.limit);

    const recipe = await extractRecipeFromImages({
      ...ctx,
      images: pictures.map((p) => ({ data: p.base64, mimeType: p.type })),
      kind: await kindOfPictures(pictures),
      via: 'Shortcut',
    });

    const stored = await storePictures(supabase, pictures);
    const { data: row, error } = await supabase
      .from('recipes')
      .insert({
        title: recipe.title,
        description: recipe.description,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        image_url: stored[0]?.url ?? '',
        servings: recipe.servings,
        original_servings: recipe.servings,
        prep_time_mins: recipe.prep_time_mins,
        cook_time_mins: recipe.cook_time_mins,
        source_url: null,
        source_name: null,
        original_language: recipe.original_language || null,
        user_id: userId,
      })
      .select('id')
      .single();
    if (error || !row) throw error ?? new Error('The recipe could not be saved.');

    // The pictures are the recipe's gallery, as when importing in the app. A
    // failure here costs the gallery, not the recipe.
    const { error: galleryError } = await supabase.from('recipe_images').insert(stored.map((s, i) => ({
      recipe_id: row.id, user_id: userId, url: s.url, storage_path: s.storagePath, source: 'upload', sort_order: i,
    })));
    if (galleryError) console.warn('Shortcut import: gallery rows not saved', galleryError);

    await enrichSaved(ctx, { id: row.id as string, title: recipe.title, description: recipe.description, ingredients: recipe.ingredients, instructions: recipe.instructions, servings: recipe.servings });

    await finish({ status: 'saved', recipe_id: row.id });
    return { status: 'saved', title: recipe.title, recipeId: row.id as string };
  } catch (err) {
    if (!(err instanceof ZodError) && !(err instanceof DailyLimitError)) captureException(err);
    const error = failureMessage(err);
    await finish({ status: 'failed', error });
    return { status: 'failed', error };
  }
}

/** The script trims scripts, styles and pictures away; a recipe page is well under this. */
export const MAX_PAGE_HTML = 3_000_000;

/**
 * The page from the Safari Shortcut's body, however Shortcuts sends it: `page`
 * as the script's JSON text (the normal case), `page` already a dictionary, or
 * `url` and `html` at the top level. A string is the message for the person.
 */
export function readSharedPage(body: Record<string, unknown>): SharedPage | string {
  let page: unknown = body.page ?? (body.html !== undefined ? { url: body.url, html: body.html } : undefined);
  if (typeof page === 'string') {
    try {
      page = JSON.parse(page);
    } catch {
      return 'The page arrived in a form that could not be read. Check that the Shortcut runs the script from Speisekammer\'s Settings.';
    }
  }
  const record = page && typeof page === 'object' ? (page as Record<string, unknown>) : {};
  const html = typeof record.html === 'string' ? record.html : '';
  const url = typeof record.url === 'string' ? record.url.trim() : '';
  let parsed: URL | null = null;
  try { parsed = new URL(url); } catch { parsed = null; }
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    return 'No web page arrived. Share a recipe page from Safari to the Shortcut.';
  }
  if (html.trim().length < 50) return 'The page arrived empty. Wait until it has loaded in Safari, then share it again.';
  if (html.length > MAX_PAGE_HTML) return 'This page is too large to send. Copy the recipe text into Speisekammer instead.';
  return { url: parsed.toString(), html };
}

/** A picture address from the page, made absolute; anything but http(s) is dropped. */
function absoluteImageUrl(value: string, pageUrl: string): string {
  if (!value) return '';
  try {
    const url = new URL(value, pageUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

/**
 * One recipe from one web page: read, saved with its address, tagged and
 * estimated. `endpoint` names the way in, in gemini_logs: 'extract-page' for
 * the Safari Shortcut, 'extract-link' for a link.
 */
export async function importPage(ctx: ImportContext, page: SharedPage, importId: string, endpoint = 'extract-page'): Promise<ImportOutcome> {
  const { supabase, userId } = ctx;
  // Without the share-tracking parameters (Instagram's igsh, utm_*…): this is
  // the address kept as the recipe's source.
  const sourceUrl = cleanSharedUrl(page.url);
  try {
    // Checks the allowance itself, after the cache: a page read before is free.
    const { recipe } = await extractRecipeFromHtml({ ...ctx, endpoint }, page.html);
    const { data: row, error } = await supabase
      .from('recipes')
      .insert({
        title: recipe.title,
        description: recipe.description,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        image_url: absoluteImageUrl(recipe.image_url, page.url),
        servings: recipe.servings,
        original_servings: recipe.servings,
        prep_time_mins: recipe.prep_time_mins,
        cook_time_mins: recipe.cook_time_mins,
        source_url: sourceUrl,
        source_name: recipe.source_name || new URL(sourceUrl).hostname.replace(/^www\./, ''),
        original_language: recipe.original_language || null,
        user_id: userId,
      })
      .select('id')
      .single();
    if (error || !row) throw error ?? new Error('The recipe could not be saved.');

    await enrichSaved(ctx, { id: row.id as string, title: recipe.title, description: recipe.description, ingredients: recipe.ingredients, instructions: recipe.instructions, servings: recipe.servings });
    await finishImport(supabase, importId, { status: 'saved', recipe_id: row.id });
    return { status: 'saved', title: recipe.title, recipeId: row.id as string };
  } catch (err) {
    if (!(err instanceof ZodError) && !(err instanceof DailyLimitError)) captureException(err);
    const error = failureMessage(err, 'page', page.url);
    await finishImport(supabase, importId, { status: 'failed', error });
    return { status: 'failed', error };
  }
}

async function importAll(ctx: ImportContext, groups: Picture[][], importIds: string[]): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = new Array(groups.length);
  let next = 0;
  const worker = async () => {
    while (next < groups.length) {
      const i = next++;
      outcomes[i] = await importOne(ctx, groups[i], importIds[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_IMPORTS, groups.length) }, worker));
  return outcomes;
}

/** The notification text for finished work. */
export function summarise(outcomes: ImportOutcome[]): string {
  const saved = outcomes.filter((o): o is Extract<ImportOutcome, { status: 'saved' }> => o.status === 'saved');
  const failed = outcomes.filter((o): o is Extract<ImportOutcome, { status: 'failed' }> => o.status === 'failed');
  if (failed.length === 0) return saved.length === 1 ? `Saved: ${saved[0].title}` : `Saved ${saved.length} recipes.`;
  if (saved.length === 0) return outcomes.length === 1 ? failed[0].error : `No recipe could be saved. ${failed[0].error}`;
  return `Saved ${saved.length} of ${outcomes.length} recipes; ${failed.length} could not be read.`;
}

export interface ShortcutDeps {
  waitUntil: (promise: Promise<unknown>) => void;
  replyWithinMs: number;
}

async function contextFor(supabase: SupabaseClient, userId: string): Promise<ImportContext | null> {
  const settings = await getSettings(supabase, userId);
  const apiKey = resolveApiKey(settings);
  return apiKey ? { supabase, client: getGeminiClient(apiKey), settings, userId } : null;
}

/** The Safari Shortcut: one web page, one recipe. Same timing rules as pictures. */
async function handlePageImport(req: VercelRequest, res: VercelResponse, supabase: SupabaseClient, userId: string, deps: ShortcutDeps) {
  const reply = (status: number, message: string) => res.status(status).json({ message });
  const page = readSharedPage((req.body ?? {}) as Record<string, unknown>);
  if (typeof page === 'string') return reply(400, page);

  const ctx = await contextFor(supabase, userId);
  if (!ctx) return reply(500, 'The AI service is not set up on the server. Nothing was saved.');

  const { data: rows, error } = await supabase
    .from('recipe_imports')
    .insert([{ user_id: userId, status: 'processing', page_count: 1, source: 'page' }])
    .select('id');
  const row = rows?.[0];
  if (error || !row) {
    if (error) captureException(error);
    return reply(500, 'The import could not be started. Nothing was saved; please try again.');
  }

  const work = importPage(ctx, page, row.id as string);
  const done = await Promise.race([
    work,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), deps.replyWithinMs)),
  ]);
  if (done) return reply(done.status === 'failed' ? 422 : 200, summarise([done]));
  deps.waitUntil(work);
  return reply(202, 'Got it. Reading the page now; the recipe will be in Speisekammer in about a minute.');
}

/** What the notification says when the page behind a link could not be had. */
export function linkRefusalMessage(refusal: PageRefusal): string {
  return refusal.code === 'site_blocked'
    ? `${refusal.error} Open it in Safari and share it to "${SAFARI_SHORTCUT_NAME}" instead.`
    : refusal.error;
}

/**
 * The link Shortcut: a link from any app's share sheet, one recipe. The page
 * is fetched before answering (a few seconds), so that a refusal reaches the
 * notification; the reading then finishes in the background like the others.
 */
async function handleLinkImport(req: VercelRequest, res: VercelResponse, supabase: SupabaseClient, userId: string, deps: ShortcutDeps) {
  const reply = (status: number, message: string) => res.status(status).json({ message });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const url = findSharedUrl(body.url ?? body.link);
  if (!url) return reply(400, 'No link arrived. Share an Instagram post or a recipe page to the Shortcut.');

  const fetched = await fetchPage(url);
  if ('refusal' in fetched) return reply(422, linkRefusalMessage(fetched.refusal));

  const ctx = await contextFor(supabase, userId);
  if (!ctx) return reply(500, 'The AI service is not set up on the server. Nothing was saved.');

  const { data: rows, error } = await supabase
    .from('recipe_imports')
    .insert([{ user_id: userId, status: 'processing', page_count: 1, source: 'link' }])
    .select('id');
  const row = rows?.[0];
  if (error || !row) {
    if (error) captureException(error);
    return reply(500, 'The import could not be started. Nothing was saved; please try again.');
  }

  const work = importPage(ctx, fetched.page, row.id as string, 'extract-link');
  const done = await Promise.race([
    work,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), deps.replyWithinMs)),
  ]);
  if (done) return reply(done.status === 'failed' ? 422 : 200, summarise([done]));
  deps.waitUntil(work);
  return reply(202, `Got it. Reading the ${isInstagramUrl(url) ? 'post' : 'page'} now; the recipe will be in Speisekammer in about a minute.`);
}

/** POST /api/extract?via=shortcut */
export async function handleShortcutImport(req: VercelRequest, res: VercelResponse, deps: ShortcutDeps = { waitUntil: vercelWaitUntil, replyWithinMs: REPLY_WITHIN_MS }) {
  const reply = (status: number, message: string) => res.status(status).json({ message });
  try {
    const headerValue = req.headers[SHORTCUT_KEY_HEADER];
    const key = (Array.isArray(headerValue) ? headerValue[0] : headerValue ?? '').trim();
    const supabase = getServerSupabase();
    const userId = key ? await userForShortcutKey(supabase, key) : null;
    if (!userId) return reply(401, 'This Shortcut has no valid key. Create one in Speisekammer under Settings → iPhone Shortcuts and paste it into the Shortcut.');

    const body = (req.body ?? {}) as { images?: unknown; mode?: unknown; page?: unknown; html?: unknown; url?: unknown; link?: unknown };
    if (body.images === undefined && (body.page !== undefined || body.html !== undefined)) {
      return handlePageImport(req, res, supabase, userId, deps);
    }
    if (body.images === undefined && (body.url !== undefined || body.link !== undefined)) {
      return handleLinkImport(req, res, supabase, userId, deps);
    }
    const mode = body.mode === 'each' ? 'each' : 'single';
    const encoded = splitBase64Images(body.images);
    if (encoded.length === 0) return reply(400, 'No pictures arrived. Share one or more photos or screenshots to the Shortcut.');
    if (encoded.length > MAX_EXTRACT_PHOTOS) return reply(400, `At most ${MAX_EXTRACT_PHOTOS} pictures can be sent at once.`);
    if (encoded.reduce((n, b) => n + b.length, 0) > MAX_TOTAL_BASE64) {
      return reply(413, 'The pictures are too large together. Check that the Shortcut resizes them before sending.');
    }

    const pictures: Picture[] = [];
    for (const base64 of encoded) {
      const bytes = decodeBase64(base64);
      const type = sniffImageType(bytes);
      if (type === 'image/heic') return reply(415, 'A picture arrived as HEIC. Add "Convert Image" to JPEG in the Shortcut, before "Base64 Encode".');
      if (!type) return reply(415, 'Something that is not a picture arrived. Share photos or screenshots to the Shortcut.');
      pictures.push({ base64, bytes, type });
    }

    const ctx = await contextFor(supabase, userId);
    if (!ctx) return reply(500, 'The AI service is not set up on the server. Nothing was saved.');

    const groups = mode === 'single' ? [pictures] : pictures.map((p) => [p]);
    const { data: rows, error } = await supabase
      .from('recipe_imports')
      .insert(groups.map((g) => ({ user_id: userId, status: 'processing', page_count: g.length })))
      .select('id');
    if (error || !rows || rows.length !== groups.length) {
      if (error) captureException(error);
      return reply(500, 'The import could not be started. Nothing was saved; please try again.');
    }

    const work = importAll(ctx, groups, rows.map((r) => r.id as string));
    const done = await Promise.race([
      work,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), deps.replyWithinMs)),
    ]);
    if (done) {
      const allFailed = done.every((o) => o.status === 'failed');
      return reply(allFailed ? 422 : 200, summarise(done));
    }

    // Still reading: let it finish after the Shortcut has its answer. The
    // banner in the app reports how it went, failures included.
    deps.waitUntil(work);
    return reply(202, mode === 'single'
      ? `Got it. Reading ${pictures.length === 1 ? 'the picture' : `${pictures.length} pages`} now; the recipe will be in Speisekammer in about a minute.`
      : `Got it. Reading ${groups.length} recipes now; they will be in Speisekammer in a few minutes.`);
  } catch (err) {
    captureException(err);
    return reply(500, 'Something went wrong on the server. Nothing was saved; please try again.');
  }
}
