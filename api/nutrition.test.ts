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

async function loadHandler(generated: unknown) {
  vi.resetModules();
  const secondEq = vi.fn().mockResolvedValue({ error: null });
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const update = vi.fn(() => ({ eq: firstEq }));
  const canEditRecipe = vi.fn().mockResolvedValue(true);
  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => ({ from: () => ({ update }) }),
    // Mirrors the real modelFor: per-task override, else the single model.
    // Kept in the mock rather than importOriginal so these stay unit tests.
    modelFor: (s: { task_models?: Record<string, string>; gemini_model: string }, task: string) =>
      s.task_models?.[task] || s.gemini_model,
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
    makeCacheKey: vi.fn(() => 'nutrition-key'),
    setCached: vi.fn(),
  }));
  vi.doMock('./_lib/rateLimit.js', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, used: 0, limit: 100, remaining: 100 }),
  }));
  vi.doMock('./_lib/gemini.js', () => ({
    getGeminiClient: () => ({}),
    generateJson: vi.fn().mockResolvedValue(generated),
  }));
  const mod = await import('./nutrition');
  return { handler: mod.default, firstEq, secondEq, canEditRecipe };
}

describe('/api/nutrition', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('coerces numeric string nutrition values', async () => {
    const { handler } = await loadHandler({ calories: '450', protein_g: '12', carbs_g: '40', fat_g: '18', fiber_g: '3' });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { recipeId: '550e8400-e29b-41d4-a716-446655440000', title: 'Cake', ingredients: ['cream'], servings: 4 } } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ nutrition: { calories: 450, protein_g: 12, carbs_g: 40, fat_g: 18, fiber_g: 3 } });
  });

  it('rejects recipes the user may not edit', async () => {
    const { handler, canEditRecipe } = await loadHandler({ calories: 450, protein_g: 12, carbs_g: 40, fat_g: 18, fiber_g: 3 });
    canEditRecipe.mockResolvedValue(false);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { recipeId: '550e8400-e29b-41d4-a716-446655440000', title: 'Cake', ingredients: ['cream'], servings: 4 } } as VercelRequest, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects incomplete nutrition output', async () => {
    const { handler } = await loadHandler({ calories: 450 });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { recipeId: '550e8400-e29b-41d4-a716-446655440000', title: 'Cake', ingredients: ['cream'], servings: 4 } } as VercelRequest, res);

    expect(res.statusCode).toBe(500);
  });
});
