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

async function loadHandler(generated: unknown, { canRead = true }: { canRead?: boolean } = {}) {
  vi.resetModules();
  const userCanReadRecipe = vi.fn().mockResolvedValue(canRead);
  const getCached = vi.fn().mockResolvedValue(null);
  const makeCacheKey = vi.fn((endpoint: string, input: unknown) => `${endpoint}:${JSON.stringify(input)}`);
  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => ({}),
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
    userCanReadRecipe,
  }));
  vi.doMock('./_lib/cache.js', () => ({
    getCached,
    makeCacheKey,
    setCached: vi.fn(),
  }));
  vi.doMock('./_lib/rateLimit.js', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, used: 0, limit: 100, remaining: 100 }),
  }));
  vi.doMock('./_lib/gemini.js', () => ({
    getGeminiClient: () => ({}),
    // Mirrors the real describeGeminiError closely enough for these tests:
    // our own error wording is preserved, a provider envelope is not.
    describeGeminiError: (err: unknown, fallback: string) => {
      const raw = err instanceof Error ? err.message : '';
      return raw && !raw.trimStart().startsWith('{')
        ? { status: 500, message: raw, retryable: true }
        : { status: 500, message: fallback, retryable: true };
    },
    generateJson: vi.fn().mockResolvedValue(generated),
  }));
  const mod = await import('./scale');
  return { handler: mod.default, userCanReadRecipe, getCached, makeCacheKey };
}

describe('/api/scale', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('validates scaled ingredient output', async () => {
    const { handler } = await loadHandler([{ amount: '400g', name: 'flour' }]);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { ingredients: [{ amount: '200g', name: 'flour', details: '' }], currentServings: 2, targetServings: 4 } } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ingredients: [{ amount: '400g', name: 'flour', details: '' }], cached: false });
  });

  it('rejects invalid scaled ingredient output', async () => {
    const { handler } = await loadHandler([{ amount: '400g', details: '' }]);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { ingredients: [{ amount: '200g', name: 'flour', details: '' }], currentServings: 2, targetServings: 4 } } as VercelRequest, res);

    expect(res.statusCode).toBe(500);
  });
});

describe('/api/scale: the cache of a recipe', () => {
  beforeEach(() => vi.restoreAllMocks());

  const recipeId = '550e8400-e29b-41d4-a716-446655440000';
  const body = { recipeId, ingredients: [{ amount: '200g', name: 'flour', details: '' }], currentServings: 2, targetServings: 4 };

  it('is not reachable for a recipe the caller cannot read', async () => {
    const { handler, getCached } = await loadHandler([{ amount: '400g', name: 'flour' }], { canRead: false });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body } as VercelRequest, res);

    expect(res.statusCode).toBe(403);
    expect(getCached).not.toHaveBeenCalled();
  });

  it('is keyed by the ingredients as well as the recipe', async () => {
    const { handler, userCanReadRecipe, makeCacheKey } = await loadHandler([{ amount: '400g', name: 'flour' }]);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body } as VercelRequest, res);

    expect(userCanReadRecipe).toHaveBeenCalledWith(expect.anything(), recipeId, 'user-1');
    expect(makeCacheKey).toHaveBeenCalledWith('scale', expect.objectContaining({ recipeId, ingredients: body.ingredients }));
  });
});
