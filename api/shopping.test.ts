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

async function loadHandler(rateAllowed = true, generated: unknown = [{ category: 'Produce', items: ['2 onions'] }]) {
  vi.resetModules();
  const generateJson = vi.fn().mockResolvedValue(generated);
  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => ({}),
    getSettings: vi.fn().mockResolvedValue({
      gemini_model: 'gemini-test',
      temperature_unit: 'C',
    }),
    resolveApiKey: () => 'key',
    getUserId: vi.fn().mockResolvedValue('user-1'),
  }));
  vi.doMock('./_lib/cache.js', () => ({
    getCached: vi.fn().mockResolvedValue(null),
    makeCacheKey: vi.fn(() => 'shopping-key'),
    setCached: vi.fn(),
  }));
  vi.doMock('./_lib/rateLimit.js', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: rateAllowed, used: 100, limit: 100, remaining: 0 }),
  }));
  vi.doMock('./_lib/gemini.js', () => ({
    getGeminiClient: () => ({}),
    generateJson,
  }));
  const mod = await import('./shopping');
  return { handler: mod.default, generateJson };
}

describe('/api/shopping', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 for invalid request bodies', async () => {
    const { handler } = await loadHandler();
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { ingredients: [] } } as VercelRequest, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'At least one ingredient is required' });
  });

  it('returns 429 before calling Gemini when the daily limit is exhausted', async () => {
    const { handler, generateJson } = await loadHandler(false);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { ingredients: ['2 onions'] } } as VercelRequest, res);

    expect(res.statusCode).toBe(429);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('rejects invalid Gemini shopping list output', async () => {
    const { handler } = await loadHandler(true, [{ category: '', items: [] }]);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { ingredients: ['2 onions'] } } as VercelRequest, res);

    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toContain('Too small');
  });
});
