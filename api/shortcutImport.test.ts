import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { CAMERA_JPEG, DEVICE_JPEG, HEIC_START, SCREEN_PNG } from './_lib/testFixtures/images';

/**
 * The iPhone Shortcut import (POST /api/extract?via=shortcut): a personal key
 * instead of a session, pictures in, a saved recipe out, an import row either
 * way, and an answer the Shortcut can show as a notification — within the
 * time Shortcuts waits, finishing in the background when reading takes longer.
 */

const h = vi.hoisted(() => {
  const db = {
    keys: new Map<string, string>(), // key_hash -> user_id
    imports: [] as Record<string, unknown>[],
    recipes: [] as Record<string, unknown>[],
    images: [] as Record<string, unknown>[],
    uploads: [] as { path: string; type: string }[],
  };
  const table = (name: string) => {
    if (name === 'shortcut_keys') {
      return {
        select: () => ({ eq: (_c: string, hash: string) => ({ maybeSingle: async () => ({ data: db.keys.has(hash) ? { user_id: db.keys.get(hash) } : null, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    }
    if (name === 'recipe_imports') {
      return {
        insert: (rows: Record<string, unknown>[]) => ({
          select: async () => {
            const withIds = rows.map((r, i) => ({ id: `import-${db.imports.length + i + 1}`, ...r }));
            db.imports.push(...withIds);
            return { data: withIds.map((r) => ({ id: r.id })), error: null };
          },
        }),
        update: (fields: Record<string, unknown>) => ({
          eq: (_c: string, id: string) => {
            const row = db.imports.find((r) => r.id === id);
            if (row) Object.assign(row, fields);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (name === 'recipes') {
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const saved = { id: `recipe-${db.recipes.length + 1}`, ...row };
              db.recipes.push(saved);
              return { data: { id: saved.id }, error: null };
            },
          }),
        }),
      };
    }
    if (name === 'recipe_images') {
      return { insert: async (rows: Record<string, unknown>[]) => { db.images.push(...rows); return { error: null }; } };
    }
    throw new Error(`unexpected table ${name}`);
  };
  const supabase = {
    from: table,
    storage: {
      from: () => ({
        upload: async (path: string, _bytes: Uint8Array, opts: { contentType: string }) => { db.uploads.push({ path, type: opts.contentType }); return { error: null }; },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
      }),
    },
  };
  return {
    db,
    supabase,
    extract: vi.fn(),
    generateJson: vi.fn(),
    tag: vi.fn(),
    nutrition: vi.fn(),
    rateAllowed: { value: true },
  };
});

vi.mock('./_lib/supabase.js', () => ({
  getServerSupabase: () => h.supabase,
  modelFor: (s: { task_models?: Record<string, string>; gemini_model: string }, task: string) => s.task_models?.[task] || s.gemini_model,
  thinkingFor: () => true,
  getSettings: vi.fn().mockResolvedValue({ gemini_model: 'claude-sonnet-5-5', task_models: {}, temperature_unit: 'C' }),
  resolveApiKey: () => 'key',
}));
vi.mock('./_lib/gemini.js', () => ({
  getGeminiClient: () => ({}),
  describeGeminiError: (_err: unknown, fallback: string) => ({ status: 500, message: fallback, retryable: true }),
  generateJson: h.generateJson,
}));
vi.mock('./_lib/cache.js', () => ({ getCached: async () => null, setCached: vi.fn(), makeCacheKey: () => 'k' }));
vi.mock('./_lib/sentry.js', () => ({ captureException: vi.fn() }));
vi.mock('./_lib/rateLimit.js', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: h.rateAllowed.value, used: 0, limit: 100, remaining: 100 })),
}));
vi.mock('./_lib/photoExtraction.js', () => ({ extractRecipeFromImages: h.extract }));
vi.mock('./_lib/enrich.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./_lib/enrich.js')>();
  return { ...real, tagRecipe: h.tag, estimateNutrition: h.nutrition };
});

import { REPLY_WITHIN_MS, handleShortcutImport, hashShortcutKey, newShortcutKey, readSharedPage, summarise } from './_lib/shortcutImport';

const KEY = newShortcutKey();
const recipe = (title: string) => ({
  title, description: 'Warming.', original_language: 'de', servings: 4, prep_time_mins: 10, cook_time_mins: 30,
  ingredients: [{ amount: '1', name: 'onion', details: '' }], instructions: 'Cook.', image_url: '', source_name: '',
});

async function send(body: Record<string, unknown>, opts: { key?: string | null; replyWithinMs?: number } = {}) {
  const res = {
    statusCode: 0,
    body: undefined as { message: string } | undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: { message: string }) { this.body = payload; return this; },
  };
  const waitUntil = vi.fn();
  const key = opts.key === undefined ? KEY : opts.key;
  await handleShortcutImport(
    { method: 'POST', query: { via: 'shortcut' }, headers: key ? { 'x-speisekammer-key': key } : {}, body } as unknown as VercelRequest,
    res as unknown as VercelResponse,
    { waitUntil, replyWithinMs: opts.replyWithinMs ?? 5_000 },
  );
  return { res, waitUntil };
}

beforeEach(() => {
  h.db.keys.clear();
  h.db.keys.set(hashShortcutKey(KEY), 'user-1');
  h.db.imports.length = 0;
  h.db.recipes.length = 0;
  h.db.images.length = 0;
  h.db.uploads.length = 0;
  h.rateAllowed.value = true;
  h.extract.mockReset();
  h.extract.mockImplementation(async ({ images }: { images: unknown[] }) => recipe(images.length > 1 ? 'Grandma\'s soup' : 'Pancakes'));
  h.generateJson.mockReset();
  h.generateJson.mockImplementation(async () => ({ ...recipe('Klassische Kürbissuppe'), image_url: '/images/kuerbissuppe.jpg', source_name: 'REWE' }));
  h.tag.mockReset().mockResolvedValue(['Vegetarian']);
  h.nutrition.mockReset().mockResolvedValue({ calories: 300 });
});

describe('the key', () => {
  it('is a random spk_ token, stored only as its hash', () => {
    const a = newShortcutKey();
    expect(a).toMatch(/^spk_[A-Za-z0-9_-]{40,}$/);
    expect(a).not.toBe(newShortcutKey());
    expect(hashShortcutKey(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShortcutKey(a)).not.toContain(a);
  });

  it('is required, and a wrong one is refused with a message saying where to get one', async () => {
    for (const key of [null, 'spk_not-a-real-key-at-all', 'something-else']) {
      const { res } = await send({ images: [CAMERA_JPEG] }, { key });
      expect(res.statusCode).toBe(401);
      expect(res.body?.message).toContain('Settings');
    }
    expect(h.db.imports).toHaveLength(0);
    expect(h.extract).not.toHaveBeenCalled();
  });
});

describe('one recipe across several pages', () => {
  it('reads every page together, saves the recipe with its pictures, tags and estimates it', async () => {
    const { res, waitUntil } = await send({ images: [CAMERA_JPEG, DEVICE_JPEG] });
    expect(res.statusCode).toBe(200);
    expect(res.body?.message).toBe('Saved: Grandma\'s soup');
    expect(waitUntil).not.toHaveBeenCalled();

    expect(h.extract).toHaveBeenCalledTimes(1);
    const call = h.extract.mock.calls[0][0] as { images: { mimeType: string }[]; kind: string; userId: string; via: string };
    expect(call).toMatchObject({ kind: 'photo', userId: 'user-1', via: 'Shortcut' });
    expect(call.images.map((i) => i.mimeType)).toEqual(['image/jpeg', 'image/jpeg']);

    expect(h.db.recipes).toHaveLength(1);
    expect(h.db.recipes[0]).toMatchObject({ title: 'Grandma\'s soup', user_id: 'user-1', servings: 4, original_servings: 4, image_url: `https://storage.test/${h.db.uploads[0].path}` });
    expect(h.db.images.map((i) => i.sort_order)).toEqual([0, 1]);
    expect(h.db.uploads.map((u) => u.type)).toEqual(['image/jpeg', 'image/jpeg']);
    expect(h.tag).toHaveBeenCalledTimes(1);
    expect(h.nutrition).toHaveBeenCalledTimes(1);

    expect(h.db.imports).toEqual([expect.objectContaining({ user_id: 'user-1', status: 'saved', page_count: 2, recipe_id: 'recipe-1' })]);
  });

  it('reads screenshots as screenshots: the faster model', async () => {
    await send({ images: [DEVICE_JPEG, SCREEN_PNG] });
    expect(h.extract.mock.calls[0][0]).toMatchObject({ kind: 'screenshot' });
  });

  it('takes the pictures as one block of text too, the way Shortcuts sometimes sends a list', async () => {
    await send({ images: `${CAMERA_JPEG}\n${SCREEN_PNG}` });
    expect((h.extract.mock.calls[0][0] as { images: unknown[] }).images).toHaveLength(2);
  });

  it('keeps the recipe when tagging or nutrition fails', async () => {
    h.tag.mockRejectedValue(new Error('tagging down'));
    const { res } = await send({ images: [CAMERA_JPEG] });
    expect(res.statusCode).toBe(200);
    expect(h.db.imports[0]).toMatchObject({ status: 'saved' });
  });
});

describe('one recipe per picture', () => {
  it('makes a recipe and an import row for each picture', async () => {
    const { res } = await send({ images: [CAMERA_JPEG, DEVICE_JPEG, SCREEN_PNG], mode: 'each' });
    expect(res.body?.message).toBe('Saved 3 recipes.');
    expect(h.extract).toHaveBeenCalledTimes(3);
    expect(h.db.recipes).toHaveLength(3);
    expect(h.db.imports.map((r) => [r.status, r.page_count])).toEqual([['saved', 1], ['saved', 1], ['saved', 1]]);
  });

  it('says how many could not be read', async () => {
    h.extract.mockImplementationOnce(async () => recipe('Pancakes')).mockImplementationOnce(async () => { throw new ZodError([]); });
    const { res } = await send({ images: [CAMERA_JPEG, CAMERA_JPEG], mode: 'each' });
    expect(res.body?.message).toBe('Saved 1 of 2 recipes; 1 could not be read.');
  });
});

describe('when nothing can be saved', () => {
  it('records a picture without a recipe as failed, with a reason, and saves nothing', async () => {
    h.extract.mockRejectedValue(new ZodError([]));
    const { res } = await send({ images: [CAMERA_JPEG] });
    expect(res.statusCode).toBe(422);
    expect(res.body?.message).toBe('No recipe could be read from this picture.');
    expect(h.db.recipes).toHaveLength(0);
    expect(h.db.imports[0]).toMatchObject({ status: 'failed', error: 'No recipe could be read from this picture.' });
  });

  it('respects the daily allowance', async () => {
    h.rateAllowed.value = false;
    const { res } = await send({ images: [CAMERA_JPEG] });
    expect(res.body?.message).toContain('allowance');
    expect(h.extract).not.toHaveBeenCalled();
    expect(h.db.imports[0]).toMatchObject({ status: 'failed' });
  });

  it('refuses HEIC, nothing, too many and non-pictures before reading anything', async () => {
    expect((await send({ images: [HEIC_START] })).res.body?.message).toContain('Convert Image');
    expect((await send({ images: [] })).res.statusCode).toBe(400);
    expect((await send({ images: Array(9).fill(CAMERA_JPEG) })).res.statusCode).toBe(400);
    expect((await send({ images: [Buffer.from('hello there, not an image').toString('base64')] })).res.statusCode).toBe(415);
    expect(h.extract).not.toHaveBeenCalled();
    expect(h.db.imports).toHaveLength(0);
  });
});

describe('within the time Shortcuts waits', () => {
  it('answers "Got it" when reading takes longer, and finishes in the background', async () => {
    let finishReading: (v: unknown) => void = () => {};
    h.extract.mockImplementation(() => new Promise((resolve) => { finishReading = resolve; }));
    const { res, waitUntil } = await send({ images: [CAMERA_JPEG, CAMERA_JPEG, CAMERA_JPEG] }, { replyWithinMs: 10 });

    expect(res.statusCode).toBe(202);
    expect(res.body?.message).toContain('Reading 3 pages');
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(h.db.imports[0]).toMatchObject({ status: 'processing' });

    finishReading(recipe('Grandma\'s soup'));
    await waitUntil.mock.calls[0][0];
    expect(h.db.imports[0]).toMatchObject({ status: 'saved', recipe_id: 'recipe-1' });
  });
});

describe('summarise', () => {
  it('words each outcome for a notification', () => {
    expect(summarise([{ status: 'saved', title: 'Soup', recipeId: 'r' }])).toBe('Saved: Soup');
    expect(summarise([{ status: 'failed', error: 'No recipe could be read from this picture.' }])).toBe('No recipe could be read from this picture.');
    expect(summarise([{ status: 'failed', error: 'x' }, { status: 'failed', error: 'x' }])).toBe('No recipe could be saved. x');
  });
});

describe('a web page from the Safari Shortcut', () => {
  const REWE = 'https://www.rewe.de/rezepte/klassische-kuerbissuppe/';
  const HTML = `<html lang="de"><head><title>Klassische Kürbissuppe</title>
    <meta property="og:image" content="/images/kuerbissuppe.jpg">
    <script type="application/ld+json">{"@type":"Recipe","name":"Klassische Kürbissuppe","recipeIngredient":["1 Hokkaido"],"recipeInstructions":"Kochen."}</script>
    </head><body><main>Klassische Kürbissuppe. 1 Hokkaido. Kochen.</main></body></html>`;
  const page = JSON.stringify({ url: REWE, html: HTML });

  it('reads the page the person has open, and saves the recipe with its address', async () => {
    const { res } = await send({ page });
    expect(res.statusCode).toBe(200);
    expect(res.body?.message).toBe('Saved: Klassische Kürbissuppe');

    // Read like a pasted link, with the page's structured data, logged as a page.
    expect(h.generateJson).toHaveBeenCalledTimes(1);
    const [, model, prompt, log] = h.generateJson.mock.calls[0] as [unknown, string, string, { endpoint: string; userId: string }];
    expect(model).toBe('claude-sonnet-5-5');
    expect(prompt).toContain('Structured Recipe JSON');
    expect(prompt).toContain('1 Hokkaido');
    expect(log).toMatchObject({ endpoint: 'extract-page', userId: 'user-1' });
    expect(h.extract).not.toHaveBeenCalled();

    expect(h.db.recipes).toHaveLength(1);
    expect(h.db.recipes[0]).toMatchObject({
      title: 'Klassische Kürbissuppe',
      user_id: 'user-1',
      source_url: REWE,
      source_name: 'REWE',
      // Made absolute against the page.
      image_url: 'https://www.rewe.de/images/kuerbissuppe.jpg',
    });
    expect(h.db.uploads).toHaveLength(0);
    expect(h.tag).toHaveBeenCalledTimes(1);
    expect(h.nutrition).toHaveBeenCalledTimes(1);
    expect(h.db.imports).toEqual([expect.objectContaining({ user_id: 'user-1', status: 'saved', page_count: 1, source: 'page', recipe_id: 'recipe-1' })]);
  });

  it('takes the page however Shortcuts sends it', async () => {
    await send({ page: { url: REWE, html: HTML } });
    await send({ url: REWE, html: HTML });
    expect(h.db.recipes.map((r) => r.source_url)).toEqual([REWE, REWE]);
  });

  it('names the site when the recipe has no author', async () => {
    h.generateJson.mockResolvedValue(recipe('Suppe'));
    await send({ page });
    expect(h.db.recipes[0]).toMatchObject({ source_name: 'rewe.de', image_url: '' });
  });

  it('refuses what is not a page before reading anything', () => {
    expect(readSharedPage({ page: '{not json' })).toContain('could not be read');
    expect(readSharedPage({ page: JSON.stringify({ url: 'javascript:alert(1)', html: HTML }) })).toContain('Share a recipe page from Safari');
    expect(readSharedPage({ page: JSON.stringify({ html: HTML }) })).toContain('Share a recipe page from Safari');
    expect(readSharedPage({ page: JSON.stringify({ url: REWE, html: '' }) })).toContain('empty');
    expect(readSharedPage({ page: JSON.stringify({ url: REWE, html: 'x'.repeat(3_000_001) }) })).toContain('too large');
  });

  it('answers a refused page with its reason, and starts nothing', async () => {
    const { res } = await send({ page: '{not json' });
    expect(res.statusCode).toBe(400);
    expect(h.db.imports).toHaveLength(0);
    expect(h.generateJson).not.toHaveBeenCalled();
  });

  it('records a page without a recipe as failed, in words about a page', async () => {
    h.generateJson.mockResolvedValue({ ...recipe(''), ingredients: [], instructions: '' });
    const { res } = await send({ page: JSON.stringify({ url: 'https://example.com/about', html: '<html><body>About us, our team and our story.</body></html>' }) });
    expect(res.statusCode).toBe(422);
    expect(res.body?.message).toBe('No recipe was found on this page.');
    expect(h.db.recipes).toHaveLength(0);
    expect(h.db.imports[0]).toMatchObject({ status: 'failed', source: 'page', error: 'No recipe was found on this page.' });
  });

  it('respects the daily allowance', async () => {
    h.rateAllowed.value = false;
    const { res } = await send({ page });
    expect(res.body?.message).toContain('allowance');
    expect(h.generateJson).not.toHaveBeenCalled();
  });

  it('answers "Got it" when reading takes longer, and finishes in the background', async () => {
    let finishReading: (v: unknown) => void = () => {};
    h.generateJson.mockImplementation(() => new Promise((resolve) => { finishReading = resolve; }));
    const { res, waitUntil } = await send({ page }, { replyWithinMs: 10 });
    expect(res.statusCode).toBe(202);
    expect(res.body?.message).toBe('Got it. Reading the page now; the recipe will be in Speisekammer in about a minute.');
    finishReading(recipe('Kürbissuppe'));
    await waitUntil.mock.calls[0][0];
    expect(h.db.imports[0]).toMatchObject({ status: 'saved' });
  });
});

describe('the answer to the iPhone', () => {
  it('comes as soon as the pictures have arrived, not after the reading', async () => {
    // The phone used to wait up to 20 s on a spinner for "Saved: <title>".
    expect(REPLY_WITHIN_MS).toBe(0);
    let finishReading: (v: unknown) => void = () => {};
    h.extract.mockImplementation(() => new Promise((resolve) => { finishReading = resolve; }));
    const { res, waitUntil } = await send({ images: [CAMERA_JPEG] }, { replyWithinMs: REPLY_WITHIN_MS });
    expect(res.statusCode).toBe(202);
    expect(res.body?.message).toBe('Got it. Reading the picture now; the recipe will be in Speisekammer in about a minute.');
    // Recorded before answering, so the app shows it as being read.
    expect(h.db.imports[0]).toMatchObject({ status: 'processing' });
    finishReading(recipe('Soup'));
    await waitUntil.mock.calls[0][0];
    expect(h.db.imports[0]).toMatchObject({ status: 'saved' });
  });
});
