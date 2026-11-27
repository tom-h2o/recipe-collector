import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Admin → Feedback (migration 0078). People write reports from the browser
 * under RLS; reading everyone's and setting a status is the admin's, through
 * the service key, so the checks that matter are here: nobody else gets the
 * list, and nobody else can change a status.
 */
const ADMIN = 'admin-id';

const h = vi.hoisted(() => {
  process.env.VITE_ADMIN_EMAIL = 'admin@example.test';
  return {
    userId: vi.fn<() => Promise<string | null>>(),
    ops: [] as { table: string; op: string; args: unknown[] }[],
    result: vi.fn<(table: string, ops: string[]) => unknown>(),
  };
});

vi.mock('./_lib/supabase.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./_lib/supabase.js')>();
  const from = (table: string) => {
    const seen: string[] = [];
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'order', 'range', 'update', 'eq']) {
      builder[op] = (...args: unknown[]) => { h.ops.push({ table, op, args }); seen.push(op); return builder; };
    }
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(h.result(table, seen)).then(resolve);
    return builder;
  };
  return {
    ...real,
    getUserId: () => h.userId(),
    getServerSupabase: () => ({
      auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: id === ADMIN ? 'admin@example.test' : `${id}@example.test`, email_confirmed_at: '2026-01-01T00:00:00Z' } }, error: null }) } },
      from,
    }),
  };
});

import handler from './account';

function call(method: string, query: Record<string, string>, body?: unknown) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
    end() { return this; },
  };
  const req = { method, query, headers: { authorization: 'Bearer t' }, body };
  return handler(req as unknown as VercelRequest, res as unknown as VercelResponse).then(() => res);
}

const ROW = {
  id: '11111111-1111-4111-8111-111111111111', created_at: '2026-11-27T10:00:00Z', user_id: 'ann',
  kind: 'bug', message: 'The timer stops.', context: { view: 'vault' }, status: 'new',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.ops.length = 0;
  h.userId.mockResolvedValue(ADMIN);
  delete process.env.ADMIN_USER_ID;
  h.result.mockImplementation((_table, ops) => (ops.includes('update') ? { data: [{ id: ROW.id }], error: null } : { data: [ROW], count: 1, error: null }));
});

describe('GET /api/account?tab=feedback', () => {
  it('gives the admin one page, newest first, with who sent each', async () => {
    const res = await call('GET', { tab: 'feedback', page: '0', pageSize: '25' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ feedback: [{ ...ROW, user_email: 'ann@example.test' }], total: 1 });
    expect(h.ops.find((o) => o.op === 'order')?.args).toEqual(['created_at', { ascending: false }]);
    expect(h.ops.find((o) => o.op === 'range')?.args).toEqual([0, 24]);
  });

  it('refuses everyone else, without reading the table', async () => {
    h.userId.mockResolvedValue('someone');
    const res = await call('GET', { tab: 'feedback' });
    expect(res.statusCode).toBe(403);
    expect(h.ops).toEqual([]);
  });

  it('asks for sign-in first', async () => {
    h.userId.mockResolvedValue(null);
    expect((await call('GET', { tab: 'feedback' })).statusCode).toBe(401);
    expect(h.ops).toEqual([]);
  });
});

describe('POST /api/account?action=feedback-status', () => {
  it('lets the admin set a report to seen or done', async () => {
    const res = await call('POST', { action: 'feedback-status' }, { id: ROW.id, status: 'done' });
    expect(res.statusCode).toBe(200);
    expect(h.ops.find((o) => o.op === 'update')).toMatchObject({ table: 'feedback', args: [{ status: 'done' }] });
    expect(h.ops.find((o) => o.op === 'eq')?.args).toEqual(['id', ROW.id]);
  });

  it('refuses everyone else, without writing', async () => {
    h.userId.mockResolvedValue('someone');
    const res = await call('POST', { action: 'feedback-status' }, { id: ROW.id, status: 'done' });
    expect(res.statusCode).toBe(403);
    expect(h.ops).toEqual([]);
  });

  it('refuses a status the table does not have, and an id that is not one', async () => {
    expect((await call('POST', { action: 'feedback-status' }, { id: ROW.id, status: 'deleted' })).statusCode).toBe(400);
    expect((await call('POST', { action: 'feedback-status' }, { id: 'all', status: 'done' })).statusCode).toBe(400);
    expect(h.ops.some((o) => o.op === 'update')).toBe(false);
  });

  it('says when the report does not exist', async () => {
    h.result.mockReturnValue({ data: [], error: null });
    const res = await call('POST', { action: 'feedback-status' }, { id: ROW.id, status: 'seen' });
    expect(res.statusCode).toBe(404);
  });

  it('never reaches account deletion', async () => {
    // DELETE is the same endpoint's most dangerous branch; a POST must not fall into it.
    const res = await call('POST', { action: 'feedback-status' }, { id: ROW.id, status: 'seen' });
    expect(res.statusCode).toBe(200);
    expect(h.ops.every((o) => o.table === 'feedback')).toBe(true);
  });
});
