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
    setCached: vi.fn(),
  }));
  vi.doMock('./_lib/rateLimit.js', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, used: 0, limit: 100, remaining: 100 }),
  }));
  vi.doMock('./_lib/gemini.js', () => ({
    getGeminiClient: () => ({}),
    generateJson: vi.fn().mockResolvedValue(generated),
  }));
  const mod = await import('./scale');
  return { handler: mod.default };
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
