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
  const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => ({ from: () => ({ update }) }),
    getSettings: vi.fn().mockResolvedValue({
      gemini_model: 'gemini-test',
      gemini_prompt: '',
      gemini_prompt_tag: '',
      gemini_prompt_nutrition: '',
      gemini_prompt_translate: '',
      gemini_prompt_suggest: '',
      gemini_prompt_shopping: '',
      temperature_unit: 'C',
    }),
    resolveApiKey: () => 'key',
    getUserId: vi.fn().mockResolvedValue('user-1'),
  }));
  vi.doMock('./_lib/cache.js', () => ({
    getCached: vi.fn().mockResolvedValue(null),
    makeCacheKey: vi.fn(() => 'tag-key'),
    setCached: vi.fn(),
  }));
  vi.doMock('./_lib/rateLimit.js', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, used: 0, limit: 100, remaining: 100 }),
  }));
  vi.doMock('./_lib/gemini.js', () => ({
    getGeminiClient: () => ({ models: { embedContent: vi.fn().mockResolvedValue({ embeddings: [{ values: [0.1] }] }) } }),
    generateJson: vi.fn().mockResolvedValue(generated),
  }));
  const mod = await import('./tag');
  return { handler: mod.default };
}

describe('/api/tag', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('filters Gemini tags to supported tags', async () => {
    const { handler } = await loadHandler(['Dessert', 'Unsupported']);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { recipeId: '550e8400-e29b-41d4-a716-446655440000', title: 'Cake', ingredients: ['cream'] } } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ tags: ['Dessert'] });
  });

  it('rejects Gemini output with no supported tags', async () => {
    const { handler } = await loadHandler(['Unsupported']);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { recipeId: '550e8400-e29b-41d4-a716-446655440000', title: 'Cake', ingredients: ['cream'] } } as VercelRequest, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Gemini returned no supported tags.' });
  });
});
