import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * The shared iPhone Shortcut link (migration 0071): every user gets a button
 * that opens it, so only the admin may set it, and only to an iCloud Shortcut
 * link. An empty value removes it.
 */

const ADMIN = 'admin-id';

const h = vi.hoisted(() => {
  process.env.VITE_ADMIN_EMAIL = 'admin@example.test';
  return {
    userId: vi.fn<() => Promise<string | null>>(),
    upserts: [] as unknown[][],
  };
});

vi.mock('./_lib/supabase.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./_lib/supabase.js')>();
  return {
    ...real,
    getUserId: () => h.userId(),
    getServerSupabase: () => ({
      auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: id === ADMIN ? 'admin@example.test' : 'cook@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' } }, error: null }) } },
      from: () => ({ upsert: async (...args: unknown[]) => { h.upserts.push(args); return { error: null }; } }),
    }),
  };
});

import handler from './account';

async function post(body: unknown) {
  const res = {
    statusCode: 0,
    body: undefined as Record<string, unknown> | undefined,
    setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(payload: Record<string, unknown>) { this.body = payload; return this; },
    end() { return this; },
  };
  await handler({ method: 'POST', query: { action: 'shortcut-url' }, headers: { authorization: 'Bearer t' }, body } as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

const LINK = 'https://www.icloud.com/shortcuts/5f2b0c3a9e4d4b8f8c2a1d6e7f9a0b1c';

beforeEach(() => {
  h.upserts.length = 0;
  h.userId.mockResolvedValue(ADMIN);
});

describe('POST /api/account?action=shortcut-url', () => {
  it('stores the admin\'s iCloud link on the global row', async () => {
    const res = await post({ url: `  ${LINK}  ` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ url: LINK, kind: 'photos' });
    expect(h.upserts[0]).toEqual([{ id: 1, user_id: null, shortcut_url: LINK }, { onConflict: 'id' }]);
  });

  it('keeps the Safari Shortcut\'s link in its own column', async () => {
    const res = await post({ url: LINK, kind: 'safari' });
    expect(res.body).toEqual({ url: LINK, kind: 'safari' });
    expect(h.upserts[0]).toEqual([{ id: 1, user_id: null, safari_shortcut_url: LINK }, { onConflict: 'id' }]);
    // And nothing else can be named as the column to write.
    expect((await post({ url: LINK, kind: 'gemini_model' })).statusCode).toBe(400);
    expect(h.upserts).toHaveLength(1);
  });


  it('removes the link when it is emptied', async () => {
    for (const url of ['', null]) {
      const res = await post({ url });
      expect(res.body).toEqual({ url: null, kind: 'photos' });
    }
    expect(h.upserts.map((u) => (u[0] as { shortcut_url: unknown }).shortcut_url)).toEqual([null, null]);
  });

  it('refuses anything without an iCloud Shortcut link, since every user\'s button opens it', async () => {
    for (const url of ['https://evil.example/shortcuts/abc12345', 'javascript:alert(1)', 'http://www.icloud.com/shortcuts/abc12345', 'Speisekammer Web']) {
      const res = await post({ url });
      expect(res.statusCode, url).toBe(400);
      expect(String(res.body?.error)).toContain('iCloud link');
    }
    expect(h.upserts).toHaveLength(0);
  });

  it('is the admin\'s alone', async () => {
    h.userId.mockResolvedValue('user-2');
    expect((await post({ url: LINK })).statusCode).toBe(403);
    h.userId.mockResolvedValue(null);
    expect((await post({ url: LINK })).statusCode).toBe(401);
    expect(h.upserts).toHaveLength(0);
  });

  it('finds the link in whatever was pasted, and keeps only its canonical form', async () => {
    // The Shortcuts app can hand over the name with the link, or a query after it.
    const pasted = [
      `Speisekammer Web\n${LINK}`,
      `${LINK}?redirect=https://evil.example`,
      LINK.replace('https://www.', 'https://'),
    ];
    for (const url of pasted) {
      const res = await post({ url, kind: 'safari' });
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toEqual({ url: LINK, kind: 'safari' });
    }
    expect(h.upserts.map((u) => (u[0] as { safari_shortcut_url: unknown }).safari_shortcut_url)).toEqual([LINK, LINK, LINK]);
  });
});
