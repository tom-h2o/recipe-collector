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

type Result = { data?: unknown; error?: unknown; count?: number };
/** One query as the handler built it: table, first verb, then every filter. */
interface Call { table: string; verb: string; payload?: unknown; steps: [string, unknown[]][] }

/**
 * A stand-in for the Supabase client that records each query's chain and
 * answers it from `answer`. The tests then check *which* filters were used:
 * for this endpoint, the bug was a missing one.
 */
function fakeSupabase(answer: (call: Call) => Result) {
  const calls: Call[] = [];
  const query = (call: Call) => {
    const chain: Record<string, unknown> = {};
    const settle = () => Promise.resolve({ data: null, error: null, ...answer(call) });
    for (const method of ['eq', 'gte', 'select', 'in', 'not', 'order', 'limit']) {
      chain[method] = (...args: unknown[]) => { call.steps.push([method, args]); return chain; };
    }
    chain.single = () => settle();
    chain.maybeSingle = () => settle();
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => settle().then(resolve, reject);
    return chain;
  };
  const supabase = {
    from: vi.fn((table: string) => {
      const start = (verb: string) => (payload?: unknown, ...rest: unknown[]) => {
        const call: Call = { table, verb, payload, steps: [] };
        if (verb === 'select') call.steps.push(['select', [payload, ...rest]]);
        calls.push(call);
        return query(call);
      };
      return { select: start('select'), insert: start('insert'), update: start('update'), upsert: start('upsert'), delete: start('delete') };
    }),
  };
  return { supabase, calls };
}

const has = (call: Call, method: string, ...args: unknown[]) =>
  call.steps.some(([m, a]) => m === method && args.every((arg, i) => a[i] === arg));

const SHARE = {
  id: '11111111-1111-4111-8111-111111111111',
  recipe_id: '22222222-2222-4222-8222-222222222222',
  sender_id: 'sender-1',
  sender_email: 'sender@example.com',
  recipient_email: 'me@example.com',
  status: 'pending',
};
const ORIGINAL = { id: SHARE.recipe_id, user_id: 'sender-1', title: 'Soup', ingredients: [], instructions: 'stir' };

const ME = { id: 'me-1', email: 'me@example.com', emailConfirmed: true };

async function loadHandler(user: { id: string; email: string | null; emailConfirmed?: boolean } | null, answer: (call: Call) => Result) {
  vi.resetModules();
  const fake = fakeSupabase(answer);
  vi.doMock('./_lib/supabase.js', () => ({
    getServerSupabase: () => fake.supabase,
    getAuthenticatedUser: vi.fn().mockResolvedValue(user),
  }));
  vi.doMock('./_lib/sentry.js', () => ({ captureException: vi.fn() }));
  const mod = await import('./share');
  return { handler: mod.default, calls: fake.calls, DAILY_SHARE_LIMIT: mod.DAILY_SHARE_LIMIT };
}

const post = (body: unknown, auth = true) => ({ method: 'POST', headers: auth ? { authorization: 'Bearer token' } : {}, body }) as VercelRequest;

describe('/api/share — send', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
  });

  const send = { action: 'send', recipeId: '550e8400-e29b-41d4-a716-446655440000', recipientEmail: 'friend@example.com' };

  it('rejects forged identity fields when no bearer user exists', async () => {
    const { handler } = await loadHandler(null, () => ({}));
    const res = createResponse();
    await handler(post({ ...send, senderUserId: '00000000-0000-0000-0000-000000000999', senderEmail: 'forged@example.com' }, false), res);
    expect(res.statusCode).toBe(401);
  });

  it('uses the bearer user, not forged body identity, for recipe ownership', async () => {
    const { handler } = await loadHandler({ id: 'real-user', email: 'real@example.com' }, (call) =>
      call.table === 'recipes' ? { data: { id: 'recipe-1', title: 'Recipe', user_id: 'other-user' } } : {});
    const res = createResponse();
    await handler(post({ ...send, senderUserId: 'other-user', senderEmail: 'forged@example.com' }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'You do not own this recipe.' });
  });

  it('refuses once the day\'s sending allowance is used', async () => {
    const { handler, calls, DAILY_SHARE_LIMIT } = await loadHandler(ME, (call) => {
      if (call.table === 'recipes') return { data: { id: 'recipe-1', title: 'Recipe', user_id: ME.id } };
      if (call.table === 'recipe_shares' && call.verb === 'select') return { count: DAILY_SHARE_LIMIT };
      return {};
    });
    const res = createResponse();
    await handler(post(send), res);
    expect(res.statusCode).toBe(429);
    expect(calls.some((c) => c.verb === 'insert')).toBe(false);
    const counted = calls.find((c) => c.table === 'recipe_shares' && c.verb === 'select')!;
    expect(has(counted, 'eq', 'sender_id', ME.id)).toBe(true);
  });

  it.each([
    ['one of our own photos', 'https://proj.supabase.co/storage/v1/object/public/recipe-images/a.jpg', 'https://proj.supabase.co/storage/v1/object/public/recipe-images/a.jpg'],
    ['a picture anywhere else, which could be a tracking pixel', 'https://tracker.example/pixel.gif', null],
  ])('sends %s as the preview', async (_what, imageUrl, expected) => {
    const { handler, calls } = await loadHandler(ME, (call) => {
      if (call.table === 'recipes') return { data: { id: 'recipe-1', title: 'Recipe', image_url: imageUrl, user_id: ME.id } };
      if (call.table === 'recipe_shares' && call.verb === 'select') return { count: 0, data: null };
      return {};
    });
    const res = createResponse();
    await handler(post(send), res);
    expect(res.statusCode).toBe(200);
    const inserted = calls.find((c) => c.table === 'recipe_shares' && c.verb === 'insert')!;
    expect((inserted.payload as { recipe_image_url: unknown }).recipe_image_url).toBe(expected);
  });
});

describe('/api/share — accept', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const accept = { action: 'accept', shareId: SHARE.id };

  it('claims the share in one update, only while it is pending and addressed to the caller', async () => {
    const { handler, calls } = await loadHandler(ME, (call) => {
      if (call.table === 'recipe_shares' && call.verb === 'update') return { data: SHARE };
      if (call.table === 'recipes' && call.verb === 'select') return { data: ORIGINAL };
      if (call.table === 'recipes' && call.verb === 'insert') return { data: { id: 'copy-1' } };
      return { data: [] };
    });
    const res = createResponse();
    await handler(post(accept), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, newRecipeId: 'copy-1' });
    const claim = calls.find((c) => c.table === 'recipe_shares' && c.verb === 'update')!;
    expect(claim.payload).toEqual({ status: 'accepted' });
    expect(has(claim, 'eq', 'id', SHARE.id)).toBe(true);
    expect(has(claim, 'eq', 'recipient_email', ME.email)).toBe(true);
    expect(has(claim, 'eq', 'status', 'pending')).toBe(true);
    // The claim comes first: nothing is copied before it.
    expect(calls.indexOf(claim)).toBeLessThan(calls.findIndex((c) => c.table === 'recipes'));
  });

  it('copies only a recipe the sender owns, whatever the share row points at', async () => {
    const { handler, calls } = await loadHandler(ME, (call) => {
      if (call.table === 'recipe_shares' && call.verb === 'update') return { data: SHARE };
      // As though recipe_id had been pointed at somebody else's recipe: the
      // sender-owned lookup finds nothing.
      if (call.table === 'recipes' && call.verb === 'select') return { data: null };
      return {};
    });
    const res = createResponse();
    await handler(post(accept), res);

    expect(res.statusCode).toBe(404);
    const lookup = calls.find((c) => c.table === 'recipes' && c.verb === 'select')!;
    expect(has(lookup, 'eq', 'id', SHARE.recipe_id)).toBe(true);
    expect(has(lookup, 'eq', 'user_id', SHARE.sender_id)).toBe(true);
    expect(calls.some((c) => c.table === 'recipes' && c.verb === 'insert')).toBe(false);
  });

  it('answers 404 for a share already taken, and copies nothing', async () => {
    const { handler, calls } = await loadHandler(ME, () => ({ data: null }));
    const res = createResponse();
    await handler(post(accept), res);
    expect(res.statusCode).toBe(404);
    expect(calls.some((c) => c.table === 'recipes')).toBe(false);
  });

  it('gives the share back when the copy fails, so it can be accepted again', async () => {
    const { handler, calls } = await loadHandler(ME, (call) => {
      if (call.table === 'recipe_shares' && call.verb === 'update') return { data: SHARE };
      if (call.table === 'recipes' && call.verb === 'select') return { data: ORIGINAL };
      if (call.table === 'recipes' && call.verb === 'insert') return { error: { message: 'insert or update on table "recipes" violates foreign key constraint' } };
      return {};
    });
    const res = createResponse();
    await handler(post(accept), res);

    expect(res.statusCode).toBe(500);
    // Our own words, never the database's.
    expect(res.body).toEqual({ error: 'Failed to process share request.' });
    const updates = calls.filter((c) => c.table === 'recipe_shares' && c.verb === 'update');
    expect(updates.map((u) => u.payload)).toEqual([{ status: 'accepted' }, { status: 'pending' }]);
  });

  it('refuses an account whose email address was never confirmed', async () => {
    const { handler, calls } = await loadHandler({ ...ME, emailConfirmed: false }, () => ({}));
    const res = createResponse();
    await handler(post(accept), res);
    expect(res.statusCode).toBe(403);
    expect(calls).toEqual([]);
  });
});
