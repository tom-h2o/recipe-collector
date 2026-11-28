import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Admin → System → "Add search words" (migration 0080): recipes tagged before
 * the search read German and English words get them, a few per request. What
 * matters here: only the admin can spend those AI calls, tags are never
 * touched, a recipe that fails does not stall the run, and counting costs
 * nothing.
 */
const ADMIN = 'admin-id';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const h = vi.hoisted(() => {
  process.env.VITE_ADMIN_EMAIL = 'admin@example.test';
  process.env.GEMINI_API_KEY_1 = 'key';
  return {
    userId: vi.fn<() => Promise<string | null>>(),
    ops: [] as { table: string; op: string; args: unknown[] }[],
    result: vi.fn<(table: string, ops: string[], args: unknown[][]) => unknown>(),
    addSearchWords: vi.fn<(ctx: unknown, recipe: { id: string }) => Promise<boolean>>(),
  };
});

vi.mock('./_lib/supabase.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./_lib/supabase.js')>();
  const from = (table: string) => {
    const seen: string[] = [];
    const args: unknown[][] = [];
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'order', 'limit', 'is', 'not', 'eq', 'maybeSingle']) {
      builder[op] = (...a: unknown[]) => { h.ops.push({ table, op, args: a }); seen.push(op); args.push(a); return builder; };
    }
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(h.result(table, seen, args)).then(resolve);
    return builder;
  };
  return {
    ...real,
    getUserId: () => h.userId(),
    getSettings: async () => ({ gemini_model: 'gemini-test', temperature_unit: 'C' }),
    getServerSupabase: () => ({
      auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: id === ADMIN ? 'admin@example.test' : `${id}@example.test`, email_confirmed_at: '2026-01-01T00:00:00Z' } }, error: null }) } },
      from,
    }),
  };
});
vi.mock('./_lib/enrich.js', () => ({ addSearchWords: h.addSearchWords }));
vi.mock('./_lib/gemini.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_lib/gemini.js')>()),
  getGeminiClient: () => ({}),
}));

import handler from './account';

function call(body?: unknown) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
    end() { return this; },
  };
  const req = { method: 'POST', query: { action: 'search-words' }, headers: { authorization: 'Bearer t' }, body };
  return handler(req as unknown as VercelRequest, res as unknown as VercelResponse).then(() => res);
}

/** The table as the handler sees it: a count of recipes without words, and a batch of them. */
function recipesMissing(counts: number[], batch: { id: string }[]) {
  h.result.mockImplementation((_table, ops, args) => {
    const head = (args[ops.indexOf('select')]?.[1] as { head?: boolean } | undefined)?.head;
    if (head) return { count: counts.shift() ?? 0, error: null };
    return { data: batch.map((r) => ({ ...r, title: 'T', description: null, ingredients: [], instructions: '' })), error: null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.ops.length = 0;
  h.userId.mockResolvedValue(ADMIN);
  delete process.env.ADMIN_USER_ID;
  h.addSearchWords.mockResolvedValue(true);
});

describe('POST /api/account?action=search-words', () => {
  it('is the admin\'s alone', async () => {
    h.userId.mockResolvedValue('someone-else');
    recipesMissing([5], [{ id: A }]);
    const res = await call({});
    expect(res.statusCode).toBe(403);
    expect(h.addSearchWords).not.toHaveBeenCalled();
  });

  it('reads a batch of recipes without search words and says how many are left', async () => {
    recipesMissing([5, 3], [{ id: A }, { id: B }]);
    const res = await call({ limit: 2 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ done: 2, failed: [], remaining: 3 });
    expect(h.addSearchWords).toHaveBeenCalledTimes(2);
    // Only recipes that have none, oldest first, never more than asked for.
    expect(h.ops.filter((o) => o.op === 'is').every((o) => o.args[0] === 'search_keywords' && o.args[1] === null)).toBe(true);
    expect(h.ops.find((o) => o.op === 'limit')?.args).toEqual([2]);
    // The words are stored by addSearchWords; this endpoint never writes tags.
    expect(h.ops.some((o) => o.op === 'update')).toBe(false);
  });

  it('only counts when asked for none', async () => {
    recipesMissing([7], [{ id: A }]);
    const res = await call({ limit: 0 });
    expect(res.body).toEqual({ done: 0, failed: [], remaining: 7 });
    expect(h.addSearchWords).not.toHaveBeenCalled();
  });

  it('reports a recipe that failed, so the run can leave it out', async () => {
    recipesMissing([2, 1], [{ id: A }, { id: B }]);
    h.addSearchWords.mockImplementation(async (_ctx, recipe) => {
      if (recipe.id === B) throw new Error('model unavailable');
      return true;
    });
    const res = await call({});
    expect(res.statusCode).toBe(200);
    // B still has no words, but it is not counted as left to try.
    expect(res.body).toEqual({ done: 1, failed: [B], remaining: 0 });
  });

  it('leaves out the recipes it is told to skip', async () => {
    recipesMissing([1, 0], [{ id: A }]);
    await call({ skip: [B] });
    expect(h.ops.filter((o) => o.op === 'not').map((o) => o.args)).toContainEqual(['id', 'in', `(${B})`]);
  });

  it('refuses more than five recipes a request, and ids that are not ids', async () => {
    recipesMissing([9], [{ id: A }]);
    expect((await call({ limit: 50 })).statusCode).toBe(400);
    expect((await call({ skip: ['x) or (1=1'] })).statusCode).toBe(400);
    expect(h.addSearchWords).not.toHaveBeenCalled();
  });

  it('says so when the migration has not run yet', async () => {
    h.result.mockReturnValue({ count: null, error: { code: '42703', message: 'column recipes.search_keywords does not exist' } });
    const res = await call({});
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Search words need the latest database migration. Try again in a few minutes.' });
  });
});
