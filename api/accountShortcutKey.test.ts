import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * The iPhone Shortcut key: any signed-in person can make, replace and remove
 * their own, and see when it was made and last used. The key is shown once;
 * only its hash is stored. These routes sit in the same endpoint as account
 * deletion, so the tests also hold that removing a key never touches anything
 * but the key.
 */

const h = vi.hoisted(() => ({
  userId: vi.fn<() => Promise<string | null>>(),
  calls: [] as { table: string; op: string; args: unknown[] }[],
  stored: null as Record<string, unknown> | null,
  deleteUser: vi.fn(),
}));

vi.mock('./_lib/supabase.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./_lib/supabase.js')>();
  const record = (table: string, op: string, ...args: unknown[]) => h.calls.push({ table, op, args });
  return {
    ...real,
    getUserId: () => h.userId(),
    getServerSupabase: () => ({
      from: (table: string) => ({
        select: (...a: unknown[]) => { record(table, 'select', ...a); return { eq: () => ({ maybeSingle: async () => ({ data: h.stored, error: null }) }) }; },
        upsert: async (row: Record<string, unknown>, opts: unknown) => { record(table, 'upsert', row, opts); h.stored = row; return { error: null }; },
        delete: () => { record(table, 'delete'); return { eq: async () => { h.stored = null; return { error: null }; } }; },
      }),
      auth: { admin: { deleteUser: h.deleteUser, getUserById: vi.fn() } },
    }),
  };
});

import handler from './account';
import { hashShortcutKey } from './_lib/shortcutImport';

async function call(method: string, query: Record<string, string>) {
  const res = {
    statusCode: 0,
    body: undefined as Record<string, unknown> | undefined,
    setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(payload: Record<string, unknown>) { this.body = payload; return this; },
    end() { return this; },
  };
  await handler({ method, query, headers: { authorization: 'Bearer t' }, body: {} } as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

beforeEach(() => {
  h.calls.length = 0;
  h.stored = null;
  h.deleteUser.mockReset();
  h.userId.mockResolvedValue('user-1');
});

describe('the Shortcut key routes', () => {
  it('make a key, return it once, and store only its hash', async () => {
    const res = await call('POST', { action: 'shortcut-key' });
    expect(res.statusCode).toBe(200);
    const key = res.body?.key as string;
    expect(key).toMatch(/^spk_/);
    const upsert = h.calls.find((c) => c.op === 'upsert');
    expect(upsert?.table).toBe('shortcut_keys');
    expect(upsert?.args[0]).toMatchObject({ user_id: 'user-1', key_hash: hashShortcutKey(key), last_used_at: null });
    expect(JSON.stringify(upsert?.args)).not.toContain(key);
  });

  it('replace the old key when a new one is made', async () => {
    const first = (await call('POST', { action: 'shortcut-key' })).body?.key;
    const second = (await call('POST', { action: 'shortcut-key' })).body?.key;
    expect(second).not.toBe(first);
    expect(h.stored).toMatchObject({ key_hash: hashShortcutKey(second as string) });
  });

  it('say whether a key exists, and when it was made and last used, but never the key', async () => {
    expect((await call('GET', { tab: 'shortcut-key' })).body).toEqual({ hasKey: false, created_at: null, last_used_at: null });
    h.stored = { created_at: '2026-11-22T10:00:00Z', last_used_at: '2026-11-22T11:00:00Z' };
    expect((await call('GET', { tab: 'shortcut-key' })).body).toEqual({ hasKey: true, created_at: '2026-11-22T10:00:00Z', last_used_at: '2026-11-22T11:00:00Z' });
  });

  it('remove the key, and nothing else: no account deletion, no other table', async () => {
    await call('POST', { action: 'shortcut-key' });
    h.calls.length = 0;
    const res = await call('POST', { action: 'shortcut-key-revoke' });
    expect(res.body).toEqual({ ok: true });
    expect(h.calls.map((c) => `${c.table}.${c.op}`)).toEqual(['shortcut_keys.delete']);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it('need a signed-in person', async () => {
    h.userId.mockResolvedValue(null);
    for (const [method, query] of [['GET', { tab: 'shortcut-key' }], ['POST', { action: 'shortcut-key' }], ['POST', { action: 'shortcut-key-revoke' }]] as const) {
      expect((await call(method, query)).statusCode).toBe(401);
    }
    expect(h.calls).toHaveLength(0);
  });
});
