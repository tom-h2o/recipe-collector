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

async function loadHandler(user: { id: string; email: string | null } | null, recipeOwner = 'owner-2') {
  vi.resetModules();
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'recipes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'recipe-1', title: 'Recipe', description: '', image_url: '', user_id: recipeOwner },
                error: null,
              }),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })) })),
        insert: vi.fn(),
        upsert: vi.fn(),
      };
    }),
  };

  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => supabase,
    getAuthenticatedUser: vi.fn().mockResolvedValue(user),
  }));

  const mod = await import('./share');
  return { handler: mod.default, supabase };
}

describe('/api/share', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects forged identity fields when no bearer user exists', async () => {
    const { handler } = await loadHandler(null);
    const res = createResponse();

    await handler({
      method: 'POST',
      headers: {},
      body: {
        action: 'send',
        recipeId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'friend@example.com',
        senderUserId: '00000000-0000-0000-0000-000000000999',
        senderEmail: 'forged@example.com',
      },
    } as VercelRequest, res);

    expect(res.statusCode).toBe(401);
  });

  it('uses the bearer user, not forged body identity, for recipe ownership', async () => {
    const { handler } = await loadHandler({ id: 'real-user', email: 'real@example.com' }, 'other-user');
    const res = createResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: {
        action: 'send',
        recipeId: '550e8400-e29b-41d4-a716-446655440000',
        recipientEmail: 'friend@example.com',
        senderUserId: 'other-user',
        senderEmail: 'forged@example.com',
      },
    } as VercelRequest, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'You do not own this recipe.' });
  });
});
