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
import { DailyLimitError, estimateNutrition, tagRecipe } from './enrich.js';
import { decodeBase64, imageSize, sniffImageType, splitBase64Images, type SupportedImageType } from './imageBytes.js';
import { decideKind, type ImageKind } from '../../shared/imageKind.js';

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
 * Shortcuts appears to give up on a request after about 30 seconds, and
 * reading several pages can take longer. So the answer comes within
 * REPLY_WITHIN_MS: "Saved: <title>" if the work is done by then, otherwise
 * "Got it" — and the work finishes in the background (Vercel's waitUntil).
 * Either way each recipe has a recipe_imports row (migration 0070), which the
 * app turns into its "new recipes from your photos" banner and New badges,
 * including the ones that could not be read.
 *
 * Every answer is `{ message }`, worded for the person: the Shortcut shows it
 * as a notification as it is.
 */

export const SHORTCUT_KEY_HEADER = 'x-speisekammer-key';
const KEY_PREFIX = 'spk_';

/** How long the Shortcut is kept waiting before it hears "Got it". */
export const REPLY_WITHIN_MS = 20_000;

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

function failureMessage(err: unknown): string {
  // extractedRecipeSchema refused the answer: no title, no ingredients or no method.
  if (err instanceof ZodError) return 'No recipe could be read from this picture.';
  if (err instanceof DailyLimitError) return 'Today\'s AI allowance is used up. Send it again tomorrow.';
  return describeGeminiError(err, 'The picture could not be read just now. Please send it again later.').message;
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
export async function importOne(ctx: ImportContext, pictures: Picture[], importId: string): Promise<ImportOutcome> {
  const { supabase, userId } = ctx;
  const finish = (fields: Record<string, unknown>) =>
    supabase.from('recipe_imports').update({ ...fields, finished_at: new Date().toISOString() }).eq('id', importId).then(() => {}, () => {});
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

    // Tags and nutrition, as the app asks for after every save. Neither is
    // allowed to undo the import: the recipe is saved either way.
    const text = { id: row.id as string, title: recipe.title, description: recipe.description, ingredients: recipe.ingredients, instructions: recipe.instructions, servings: recipe.servings };
    const enriched = await Promise.allSettled([tagRecipe(ctx, text), estimateNutrition(ctx, text)]);
    for (const r of enriched) if (r.status === 'rejected') console.warn('Shortcut import: enrichment failed', r.reason);

    await finish({ status: 'saved', recipe_id: row.id });
    return { status: 'saved', title: recipe.title, recipeId: row.id as string };
  } catch (err) {
    if (!(err instanceof ZodError) && !(err instanceof DailyLimitError)) captureException(err);
    const error = failureMessage(err);
    await finish({ status: 'failed', error });
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

/** POST /api/extract?via=shortcut */
export async function handleShortcutImport(req: VercelRequest, res: VercelResponse, deps: ShortcutDeps = { waitUntil: vercelWaitUntil, replyWithinMs: REPLY_WITHIN_MS }) {
  const reply = (status: number, message: string) => res.status(status).json({ message });
  try {
    const headerValue = req.headers[SHORTCUT_KEY_HEADER];
    const key = (Array.isArray(headerValue) ? headerValue[0] : headerValue ?? '').trim();
    const supabase = getServerSupabase();
    const userId = key ? await userForShortcutKey(supabase, key) : null;
    if (!userId) return reply(401, 'This Shortcut has no valid key. Create one in Speisekammer under Settings → iPhone Shortcut and paste it into the Shortcut.');

    const body = (req.body ?? {}) as { images?: unknown; mode?: unknown };
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

    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return reply(500, 'The AI service is not set up on the server. Nothing was saved.');
    const ctx: ImportContext = { supabase, client: getGeminiClient(apiKey), settings, userId };

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
      ? `Got it. Reading ${pictures.length === 1 ? 'the picture' : `${pictures.length} pages`}; the recipe will be in Speisekammer in a minute.`
      : `Got it. Reading ${groups.length} recipes; they will be in Speisekammer in a few minutes.`);
  } catch (err) {
    captureException(err);
    return reply(500, 'Something went wrong on the server. Nothing was saved; please try again.');
  }
}
