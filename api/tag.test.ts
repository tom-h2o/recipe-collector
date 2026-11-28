import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader: vi.fn((key: string, value: string) => { res.headers[key] = value; }),
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    json: vi.fn((body: unknown) => { res.body = body; return res; }),
    end: vi.fn(() => res),
  };
  return res as unknown as VercelResponse & typeof res;
}

async function loadHandler(generated: unknown, updateErrors: Array<{ code: string; message: string } | null> = []) {
  vi.resetModules();
  // One answer per update, in order; null (stored) once the list runs out.
  const secondEq = vi.fn(() => Promise.resolve({ error: updateErrors.shift() ?? null }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const update = vi.fn(() => ({ eq: firstEq }));
  const canEditRecipe = vi.fn().mockResolvedValue(true);
  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => ({ from: () => ({ update }) }),
    // Mirrors the real modelFor: per-task override, else the single model.
    // Kept in the mock rather than importOriginal so these stay unit tests.
    modelFor: (s: { task_models?: Record<string, string>; gemini_model: string }, task: string) =>
      s.task_models?.[task] || s.gemini_model,
    // Mirrors REASONING_OFF_TASKS.
    thinkingFor: (task: string) => !['translate', 'tag', 'nutrition'].includes(task),
    getSettings: vi.fn().mockResolvedValue({
      gemini_model: 'gemini-test',
      temperature_unit: 'C',
    }),
    resolveApiKey: () => 'key',
    getUserId: vi.fn().mockResolvedValue('user-1'),
    canEditRecipe,
  }));
  vi.doMock('./_lib/cache.js', () => ({
    getCached: vi.fn().mockResolvedValue(null),
    makeCacheKey: vi.fn(() => 'tag-key'),
    setCached: vi.fn(),
  }));
  vi.doMock('./_lib/rateLimit.js', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, used: 0, limit: 100, remaining: 100 }),
  }));
  const generateJson = vi.fn().mockResolvedValue(generated);
  vi.doMock('./_lib/gemini.js', () => ({
    EMBEDDING_MODEL: 'gemini-embedding-2',
    getGeminiClient: () => ({ models: { embedContent: vi.fn().mockResolvedValue({ embeddings: [{ values: [0.1] }] }) } }),
    // Mirrors the real describeGeminiError closely enough for these tests:
    // our own error wording is preserved, a provider envelope is not.
    describeGeminiError: (err: unknown, fallback: string) => {
      const raw = err instanceof Error ? err.message : '';
      return raw && !raw.trimStart().startsWith('{')
        ? { status: 500, message: raw, retryable: true }
        : { status: 500, message: fallback, retryable: true };
    },
    generateJson,
  }));
  const mod = await import('./tag');
  const enrich = await import('./_lib/enrich');
  return { handler: mod.default, enrich, update, firstEq, secondEq, canEditRecipe, generateJson };
}

describe('/api/tag', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('filters Gemini tags to supported tags', async () => {
    const { handler } = await loadHandler({ tags: ['Dessert', 'Unsupported'], search_words: [] });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { recipeId: '550e8400-e29b-41d4-a716-446655440000', title: 'Cake', ingredients: ['cream'] } } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ tags: ['Dessert'] });
  });

  it('rejects recipes the user may not edit', async () => {
    const { handler, canEditRecipe } = await loadHandler({ tags: ['Dessert'], search_words: [] });
    canEditRecipe.mockResolvedValue(false);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { recipeId: '550e8400-e29b-41d4-a716-446655440000', title: 'Cake', ingredients: ['cream'] } } as VercelRequest, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects Gemini output with no supported tags', async () => {
    const { handler } = await loadHandler({ tags: ['Unsupported'], search_words: ['kuchen'] });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { recipeId: '550e8400-e29b-41d4-a716-446655440000', title: 'Cake', ingredients: ['cream'] } } as VercelRequest, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'The AI returned no supported tags.' });
  });

  it('asks the model not to spend time reasoning', async () => {
    // Choosing from a fixed list is classification, and this runs after every
    // save: it is half of what the spinner on a new card waits for.
    const { handler, generateJson } = await loadHandler({ tags: ['Dessert'], search_words: [] });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { recipeId: '550e8400-e29b-41d4-a716-446655440000', title: 'Cake', ingredients: ['cream'] } } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(generateJson.mock.calls[0][4]).toMatchObject({ thinking: false });
  });

  // Migration 0080: the same call writes the words the vault search finds the
  // recipe by in German and English.
  const REQUEST = { method: 'POST', headers: {}, body: { recipeId: '550e8400-e29b-41d4-a716-446655440000', title: 'Rührei', ingredients: ['Eier'] } } as VercelRequest;

  it('stores the search words with the tags, cleaned', async () => {
    const { handler, update } = await loadHandler({
      tags: ['Breakfast'],
      search_words: ['Eier', 'eggs', '  Rührei ', 'scrambled eggs', 'eggs', '%_*', 'x'.repeat(60)],
    });
    const res = createResponse();
    await handler(REQUEST, res);

    expect(res.body).toEqual({ tags: ['Breakfast'] });
    expect(update).toHaveBeenCalledTimes(1);
    expect((update.mock.calls[0] as unknown[])[0]).toMatchObject({
      tags: ['Breakfast'],
      // Lower case, no duplicates, no wildcard characters, nothing overlong.
      search_keywords: 'eier eggs rührei scrambled eggs',
    });
  });

  it('still tags a recipe when the model leaves the search words out', async () => {
    const { handler, update } = await loadHandler({ tags: ['Breakfast'] });
    const res = createResponse();
    await handler(REQUEST, res);

    expect(res.statusCode).toBe(200);
    expect((update.mock.calls[0] as unknown[])[0]).not.toHaveProperty('search_keywords');
  });

  it('stores the tags without the words until the migration has added the column', async () => {
    const { handler, update } = await loadHandler(
      { tags: ['Breakfast'], search_words: ['eier', 'eggs'] },
      [{ code: 'PGRST204', message: "Could not find the 'search_keywords' column of 'recipes' in the schema cache" }],
    );
    const res = createResponse();
    await handler(REQUEST, res);

    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledTimes(2);
    expect((update.mock.calls[1] as unknown[])[0]).toEqual({ tags: ['Breakfast'], embedding: [0.1] });
  });

  it('keeps at most 60 search words', async () => {
    const { enrich } = await loadHandler(null);
    const words = Array.from({ length: 90 }, (_, i) => `wort${i}`);
    expect(enrich.cleanSearchWords(words).split(' ')).toHaveLength(60);
  });

  it('adds search words to an older recipe without touching its tags or the allowance', async () => {
    // The admin's backfill: the owner may have edited the tags since.
    const { enrich, update, generateJson } = await loadHandler({ tags: ['Breakfast'], search_words: ['eier', 'eggs'] });
    const rateLimit = await import('./_lib/rateLimit.js');
    const ctx = {
      supabase: { from: () => ({ update }) },
      client: {},
      settings: { gemini_model: 'gemini-test', temperature_unit: 'C' },
      userId: 'admin',
    } as unknown as Parameters<typeof enrich.addSearchWords>[0];

    expect(await enrich.addSearchWords(ctx, { id: 'r1', title: 'Rührei', ingredients: ['Eier'] })).toBe(true);
    expect(update.mock.calls.map((c) => (c as unknown[])[0])).toEqual([{ search_keywords: 'eier eggs' }]);
    expect(rateLimit.checkRateLimit).not.toHaveBeenCalled();
    expect(generateJson.mock.calls[0][3]).toMatchObject({ endpoint: 'search-words' });
  });
});
