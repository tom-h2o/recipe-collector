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

const recipeId = '550e8400-e29b-41d4-a716-446655440000';
const otherId = '550e8400-e29b-41d4-a716-446655440001';

async function loadHandler(generated: unknown) {
  vi.resetModules();
  const finalIdIn = vi.fn().mockResolvedValue({ data: [{ id: recipeId, title: 'Cake' }] });
  const finalUsersIn = vi.fn(() => ({ in: finalIdIn }));
  const fallbackLimit = vi.fn().mockResolvedValue({
    data: [{ id: recipeId, title: 'Cake', ingredients: [{ name: 'cream' }] }],
  });
  const fallbackOrder = vi.fn(() => ({ limit: fallbackLimit }));
  const fallbackUsersIn = vi.fn(() => ({ order: fallbackOrder }));
  const supabase = {
    rpc: vi.fn().mockResolvedValue({ data: [] }),
    from: vi.fn((table: string) => {
      if (table !== 'recipes') return {};
      return {
        select: vi.fn((columns?: string) => {
          if (columns === '*') {
            return {
              in: finalUsersIn,
            };
          }
          return {
            in: fallbackUsersIn,
          };
        }),
      };
    }),
  };
  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => supabase,
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
    // Suggestions cover the caller plus anyone they are linked to.
    getVisibleUserIds: vi.fn().mockResolvedValue(['user-1']),
  }));
  vi.doMock('./_lib/cache.js', () => ({
    getCached: vi.fn().mockResolvedValue(null),
    makeCacheKey: vi.fn(() => 'suggest-key'),
    setCached: vi.fn(),
  }));
  vi.doMock('./_lib/rateLimit.js', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, used: 0, limit: 100, remaining: 100 }),
  }));
  vi.doMock('./_lib/gemini.js', () => ({
    getGeminiClient: () => ({ models: { embedContent: vi.fn().mockResolvedValue({ embeddings: [] }) } }),
    generateJson: vi.fn().mockResolvedValue(generated),
  }));
  const mod = await import('./suggest');
  return { handler: mod.default, fallbackUsersIn, finalUsersIn };
}

describe('/api/suggest', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('validates and filters suggested ids to current candidates', async () => {
    const { handler, fallbackUsersIn, finalUsersIn } = await loadHandler([recipeId, otherId]);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { ingredients: ['cream'] } } as VercelRequest, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ suggestions: [{ id: recipeId, title: 'Cake' }] });
    // scoped to the visible set — the caller plus any linked accounts
    expect(fallbackUsersIn).toHaveBeenCalledWith('user_id', ['user-1']);
    expect(finalUsersIn).toHaveBeenCalledWith('user_id', ['user-1']);
  });

  it('rejects non-uuid suggested ids', async () => {
    const { handler } = await loadHandler(['not-a-uuid']);
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: { ingredients: ['cream'] } } as VercelRequest, res);

    expect(res.statusCode).toBe(500);
  });
});
