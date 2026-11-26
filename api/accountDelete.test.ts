import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('./_lib/sentry.js', () => ({ captureException: vi.fn() }));

import { deleteUserData } from './account';

const URL_OF = (path: string) => `https://proj.supabase.co/storage/v1/object/public/recipe-images/${path}`;
type Row = Record<string, unknown>;

/**
 * A small in-memory stand-in for the tables account deletion touches, enough
 * to see what is deleted and what is left. It understands the filters the
 * code uses, and nothing else.
 */
function fakeDatabase(tables: Record<string, Row[]>, { failOn }: { failOn?: string } = {}) {
  const removed: string[] = [];
  const deletedUsers: string[] = [];
  const query = (table: string, verb: 'select' | 'delete') => {
    const filters: ((row: Row) => boolean)[] = [];
    const chain = {
      eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return chain; },
      neq: (col: string, v: unknown) => { filters.push((r) => r[col] !== v); return chain; },
      in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return chain; },
      // Only ever used as .not(col, 'is', null).
      not: (col: string) => { filters.push((r) => r[col] != null); return chain; },
      like: (col: string, pattern: string) => {
        const needle = pattern.replace(/%/g, '');
        filters.push((r) => String(r[col] ?? '').includes(needle));
        return chain;
      },
      limit: () => chain,
      then: (resolve: (v: unknown) => unknown) => {
        if (failOn === table && verb === 'delete') return Promise.resolve({ error: { message: 'permission denied' } }).then(resolve);
        const rows = tables[table] ?? [];
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (verb === 'delete') tables[table] = rows.filter((r) => !hit.includes(r));
        return Promise.resolve({ data: hit, error: null }).then(resolve);
      },
    };
    return chain;
  };
  const supabase = {
    from: (table: string) => ({ select: () => query(table, 'select'), delete: () => query(table, 'delete') }),
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: URL_OF(path) } }),
        remove: async (paths: string[]) => { removed.push(...paths); return { error: null }; },
      }),
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: { id, email: 'Leaving@Example.com' } }, error: null }),
        deleteUser: async (id: string) => { deletedUsers.push(id); return { error: null }; },
      },
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, tables, removed, deletedUsers };
}

const ME = 'user-leaving';
const OTHER = 'user-staying';

function world() {
  return {
    recipes: [
      { id: 'r1', user_id: ME, image_url: URL_OF('mine-only.jpg') },
      { id: 'r2', user_id: ME, image_url: URL_OF('copied.jpg') },
      // Someone accepted r2 from me: their copy shows my file.
      { id: 'r3', user_id: OTHER, image_url: URL_OF('copied.jpg') },
    ],
    recipe_images: [
      { id: 'i1', user_id: ME, recipe_id: 'r1', storage_path: 'mine-only.jpg' },
      { id: 'i2', user_id: ME, recipe_id: 'r1', storage_path: 'gallery-only.jpg' },
      { id: 'i3', user_id: ME, recipe_id: 'r2', storage_path: 'copied.jpg' },
      { id: 'i4', user_id: ME, recipe_id: 'r2', storage_path: 'adopted.jpg' },
      // A linked account adopted my recipe, gallery and all.
      { id: 'i5', user_id: OTHER, recipe_id: 'r3', storage_path: 'adopted.jpg' },
      { id: 'i6', user_id: ME, recipe_id: 'r1', storage_path: null, url: 'https://example.com/x.jpg' },
    ],
    meal_plan: [{ user_id: ME }, { user_id: OTHER }],
    shopping_list: [{ user_id: ME }],
    settings: [{ user_id: ME }, { id: 1, user_id: null }],
    gemini_logs: [{ user_id: ME, input: 'my recipe text' }, { user_id: OTHER }],
    recipe_shares: [
      { recipient_email: 'leaving@example.com', status: 'pending' },
      { recipient_email: 'leaving@example.com', status: 'accepted' },
      { recipient_email: 'someone@example.com', status: 'pending' },
    ],
    account_links: [
      { addressee_email: 'leaving@example.com', status: 'pending' },
      { addressee_email: 'someone@example.com', status: 'pending' },
    ],
  } as Record<string, Row[]>;
}

describe('deleting an account', () => {
  it('removes the photo files only this account used, and keeps those others still show', async () => {
    const db = fakeDatabase(world());
    await deleteUserData(db.supabase, ME);
    expect(db.removed.sort()).toEqual(['gallery-only.jpg', 'mine-only.jpg']);
  });

  it('deletes the AI log, which holds the full text of what was sent', async () => {
    const db = fakeDatabase(world());
    await deleteUserData(db.supabase, ME);
    expect(db.tables.gemini_logs).toEqual([{ user_id: OTHER }]);
  });

  it('withdraws what is still waiting for the address, so the next owner of it does not get it', async () => {
    const db = fakeDatabase(world());
    await deleteUserData(db.supabase, ME);
    expect(db.tables.recipe_shares).toEqual([
      { recipient_email: 'leaving@example.com', status: 'accepted' },
      { recipient_email: 'someone@example.com', status: 'pending' },
    ]);
    expect(db.tables.account_links).toEqual([{ addressee_email: 'someone@example.com', status: 'pending' }]);
  });

  it('deletes the rows that do not cascade, and then the account', async () => {
    const db = fakeDatabase(world());
    await deleteUserData(db.supabase, ME);
    expect(db.tables.recipes.map((r) => r.id)).toEqual(['r3']);
    expect(db.tables.meal_plan).toEqual([{ user_id: OTHER }]);
    expect(db.tables.shopping_list).toEqual([]);
    expect(db.tables.settings).toEqual([{ id: 1, user_id: null }]);
    expect(db.deletedUsers).toEqual([ME]);
  });

  it('stops, and keeps the account, when a step fails', async () => {
    const db = fakeDatabase(world(), { failOn: 'recipes' });
    await expect(deleteUserData(db.supabase, ME)).rejects.toThrow(/Deleting recipes failed/);
    expect(db.deletedUsers).toEqual([]);
    expect(db.removed).toEqual([]);
  });
});
