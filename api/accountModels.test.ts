import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * The AI models are chosen by the admin, for everyone (migration 0068).
 *
 * Two halves, both server-side because that is where the rule is enforced:
 * getSettings() reads models from the global row only, so a model left on a
 * user's own row (or written there through the browser client, which RLS
 * allows on one's own row) changes nothing; and the only write path,
 * POST /api/account?action=models, refuses anyone but the admin and any id the
 * app does not offer.
 */

const ADMIN = 'admin-id';
const ADMIN_EMAIL = 'admin@example.test';

const h = vi.hoisted(() => {
  process.env.VITE_ADMIN_EMAIL = 'admin@example.test';
  return {
    userId: vi.fn<() => Promise<string | null>>(),
    saveModelConfig: vi.fn(),
    emailOf: vi.fn<(id: string) => string>(),
  };
});

vi.mock('./_lib/supabase.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./_lib/supabase.js')>();
  return {
    ...real,
    getUserId: () => h.userId(),
    saveModelConfig: (...args: unknown[]) => h.saveModelConfig(...args),
    getServerSupabase: () => ({
      auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: h.emailOf(id) } }, error: null }) } },
    }),
  };
});

import handler from './account';
import { getSettings, DEFAULT_MODEL } from './_lib/supabase';

function call(body: unknown) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
    end() { return this; },
  };
  const req = { method: 'POST', query: { action: 'models' }, headers: { authorization: 'Bearer t' }, body };
  return handler(req as unknown as VercelRequest, res as unknown as VercelResponse).then(() => res);
}

const valid = { gemini_model: 'gemini-4-hydrogen', task_models: { tag: 'gemini-3.5-flash-lite', translate: 'gemini-4-hydrogen' } };

beforeEach(() => {
  vi.clearAllMocks();
  h.userId.mockResolvedValue(ADMIN);
  h.emailOf.mockImplementation((id) => (id === ADMIN ? ADMIN_EMAIL : 'someone@example.test'));
  h.saveModelConfig.mockImplementation(async (_s, config) => config);
});

describe('POST /api/account?action=models', () => {
  it('saves the admin\'s choice', async () => {
    const res = await call(valid);
    expect(res.statusCode).toBe(200);
    expect(h.saveModelConfig).toHaveBeenCalledWith(expect.anything(), valid);
    expect(res.body).toEqual(valid);
  });

  it('refuses everyone else', async () => {
    h.userId.mockResolvedValue('user-2');
    const res = await call(valid);
    expect(res.statusCode).toBe(403);
    expect(h.saveModelConfig).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not signed in', async () => {
    h.userId.mockResolvedValue(null);
    const res = await call(valid);
    expect(res.statusCode).toBe(401);
    expect(h.saveModelConfig).not.toHaveBeenCalled();
  });

  it.each([
    ['a model the app does not offer', { ...valid, gemini_model: 'gemini-typo' }],
    ['an unoffered model for one task', { ...valid, task_models: { tag: 'gemini-typo' } }],
    ['a task that does not exist', { ...valid, task_models: { cook: 'gemini-4-hydrogen' } }],
    ['a field that is not a model', { ...valid, temperature_unit: 'F' }],
    ['no body', undefined],
  ])('refuses %s', async (_label, body) => {
    const res = await call(body);
    expect(res.statusCode).toBe(400);
    expect(h.saveModelConfig).not.toHaveBeenCalled();
  });
});

describe('getSettings', () => {
  /** A client whose settings table holds the given rows, filtered by eq(). */
  function clientWith(rows: Record<string, unknown>[]) {
    return {
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => ({
            single: async () => ({ data: rows.find((r) => r[column] === value) ?? null }),
          }),
        }),
      }),
    } as never;
  }

  const globalRow = { id: 1, user_id: null, gemini_model: 'gemini-4-hydrogen', task_models: { tag: 'gemini-3.5-flash-lite' }, temperature_unit: 'C' };

  it('takes the models from the global row even when the user\'s row names others', async () => {
    const s = await getSettings(clientWith([
      globalRow,
      { id: 7, user_id: 'u1', gemini_model: 'gemini-4-carbon', task_models: { tag: 'gemini-4-carbon' }, temperature_unit: 'F' },
    ]), 'u1');
    expect(s).toEqual({ gemini_model: 'gemini-4-hydrogen', task_models: { tag: 'gemini-3.5-flash-lite' }, temperature_unit: 'F' });
  });

  it('uses the code defaults when there is no global row', async () => {
    const s = await getSettings(clientWith([]), 'u1');
    expect(s).toEqual({ gemini_model: DEFAULT_MODEL, task_models: {}, temperature_unit: 'C' });
  });

  it('keeps the models when the user has no row of their own', async () => {
    const s = await getSettings(clientWith([globalRow]), 'u1');
    expect(s.task_models).toEqual({ tag: 'gemini-3.5-flash-lite' });
    expect(s.temperature_unit).toBe('C');
  });
});
