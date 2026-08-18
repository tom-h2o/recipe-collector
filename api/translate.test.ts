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

const requestBody = {
  recipeId: '550e8400-e29b-41d4-a716-446655440000',
  targetLanguage: 'de',
  title: 'Cake',
  description: 'Simple cake',
  instructions: 'Mix and chill.',
  ingredients: [{ amount: '200g', name: 'cream cheese', details: '' }],
};

async function loadHandler(options: { upsertError?: Error } = {}) {
  vi.resetModules();
  const upsert = vi.fn().mockResolvedValue({ error: options.upsertError ?? null });
  const updateSecondEq = vi.fn().mockResolvedValue({ error: null });
  const updateFirstEq = vi.fn(() => ({ eq: updateSecondEq }));
  const update = vi.fn(() => ({ eq: updateFirstEq }));
  const userOwnsRecipe = vi.fn().mockResolvedValue(true);
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'recipe_translations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
              })),
            })),
          })),
          upsert,
        };
      }
      if (table === 'recipes') return { update };
      return {};
    }),
  };

  const generateJson = vi.fn().mockResolvedValue({
    detectedSourceLanguage: 'en-US',
    title: 'Kuchen',
    description: ['Einfacher Kuchen'],
    instructions: ['Mischen.', 'Kalt stellen.'],
    ingredients: ['200g Frischkaese'],
  });

  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => supabase,
    getSettings: vi.fn().mockResolvedValue({
      gemini_model: 'gemini-test',
      temperature_unit: 'C',
    }),
    resolveApiKey: () => 'key',
    getUserId: vi.fn().mockResolvedValue('user-1'),
    userOwnsRecipe,
  }));
  vi.doMock('./_lib/rateLimit.js', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, used: 0, limit: 100, remaining: 100 }),
  }));
  vi.doMock('./_lib/gemini.js', () => ({
    getGeminiClient: () => ({}),
    generateJson,
  }));

  const mod = await import('./translate');
  return { handler: mod.default, upsert, userOwnsRecipe };
}

describe('/api/translate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes imperfect Gemini translation output before returning it', async () => {
    const { handler, upsert } = await loadHandler();
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: requestBody } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Kuchen',
      description: 'Einfacher Kuchen',
      instructions: 'Mischen.\nKalt stellen.',
      detectedSourceLanguage: 'en',
      cached: false,
    });
    expect((res.body as { ingredients: unknown }).ingredients).toEqual([
      { amount: '', name: '200g Frischkaese', details: '' },
    ]);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Kuchen' }), { onConflict: 'recipe_id,language_code' });
  });

  it('rejects recipes not owned by the user', async () => {
    const { handler, userOwnsRecipe } = await loadHandler();
    userOwnsRecipe.mockResolvedValue(false);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: requestBody } as VercelRequest, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('fails when the translation cannot be persisted', async () => {
    const { handler } = await loadHandler({ upsertError: new Error('insert failed') });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: requestBody } as VercelRequest, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'insert failed' });
  });
});
