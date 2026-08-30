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

async function loadHandler(options: { userId?: string | null; rateAllowed?: boolean; accessKey?: string } = {}) {
  vi.resetModules();
  const checkRateLimit = vi.fn().mockResolvedValue({
    allowed: options.rateAllowed ?? true,
    used: 0,
    limit: 100,
    remaining: 100,
  });
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ results: [{ urls: { regular: 'https://images.example/recipe.jpg' } }] }),
  });

  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => ({}),
    getUserId: vi.fn().mockResolvedValue(options.userId === undefined ? 'user-1' : options.userId),
  }));
  vi.doMock('./_lib/rateLimit.js', () => ({ checkRateLimit }));
  vi.stubEnv('UNSPLASH_ACCESS_KEY', options.accessKey ?? 'unsplash-key');
  vi.stubGlobal('fetch', fetchMock);

  const mod = await import('./find-image');
  return { handler: mod.default, checkRateLimit, fetchMock };
}

describe('/api/find-image', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('requires authentication', async () => {
    const { handler, fetchMock } = await loadHandler({ userId: null });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { title: 'Cake' } } as VercelRequest, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate-limits Unsplash searches', async () => {
    const { handler, fetchMock } = await loadHandler({ rateAllowed: false });
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { title: 'Cake' } } as VercelRequest, res);

    expect(res.statusCode).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the first Unsplash image for authenticated users', async () => {
    const { handler, checkRateLimit, fetchMock } = await loadHandler();
    const res = createResponse();

    await handler({ method: 'POST', headers: { authorization: 'Bearer token' }, body: { title: 'Cake', description: 'Cream dessert' } } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ imageUrl: 'https://images.example/recipe.jpg' });
    expect(checkRateLimit).toHaveBeenCalledWith({}, 'user-1', { endpoint: 'find-image', limit: 200 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
