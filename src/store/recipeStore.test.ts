import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Recipe } from '@/types';

// ── Supabase mock ────────────────────────────────────────────────────────────
// A chainable query builder whose terminal value each test sets via `queueResult`.
const results: { data: unknown; error: unknown }[] = [];
const queueResult = (data: unknown, error: unknown = null) => results.push({ data, error });
const takeResult = () => results.shift() ?? { data: null, error: null };
// `args` keeps every argument; `payload` stays as the first one so the older
// assertions in this file are unaffected. Without the full list an .eq() records
// only the column name and drops the value being filtered on.
const calls: { table: string; op: string; payload?: unknown; args: unknown[] }[] = [];

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = (op: string) => (...args: unknown[]) => {
    calls.push({ table, op, payload: args[0], args });
    return builder;
  };
  for (const op of ['select', 'eq', 'is', 'in', 'order', 'range', 'textSearch', 'limit', 'not', 'gte']) {
    builder[op] = chain(op);
  }
  for (const op of ['insert', 'update', 'delete', 'upsert']) {
    builder[op] = chain(op);
  }
  builder.single = () => Promise.resolve(takeResult());
  builder.maybeSingle = () => Promise.resolve(takeResult());
  // Awaiting the builder resolves the queued result (Supabase builders are thenable).
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(takeResult()).then(resolve);
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({ json: async () => ({ imageUrl: '' }) }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn() } }));

import { useRecipeStore } from './recipeStore';

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', title: 'Pasta', description: '', ingredients: [], instructions: '',
  image_url: '', servings: 2, created_at: '2024-01-01T00:00:00Z', tags: [],
  is_favourite: false, nutrition: null, rating: null, notes: null,
  prep_time_mins: null, cook_time_mins: null, source_url: null, source_name: null,
  ...over,
} as Recipe);

const reset = () => {
  results.length = 0;
  calls.length = 0;
  useRecipeStore.getState().stopAllPolling();
  useRecipeStore.setState({ recipes: [], page: 0, hasMore: true, loading: false });
};

beforeEach(reset);
afterEach(() => { useRecipeStore.getState().stopAllPolling(); vi.useRealTimers(); });

describe('toggleFavourite', () => {
  it('flips the flag in local state after the write succeeds', async () => {
    useRecipeStore.setState({ recipes: [recipe({ is_favourite: false })] });
    queueResult(null);
    await useRecipeStore.getState().toggleFavourite(useRecipeStore.getState().recipes[0]);
    expect(useRecipeStore.getState().recipes[0].is_favourite).toBe(true);
  });

  it('leaves state untouched when the write fails', async () => {
    useRecipeStore.setState({ recipes: [recipe({ is_favourite: false })] });
    queueResult(null, { message: 'denied' });
    await expect(useRecipeStore.getState().toggleFavourite(useRecipeStore.getState().recipes[0])).rejects.toBeTruthy();
    expect(useRecipeStore.getState().recipes[0].is_favourite).toBe(false);
  });
});

describe('deleteRecipe', () => {
  it('removes only the target recipe', async () => {
    useRecipeStore.setState({ recipes: [recipe({ id: 'a' }), recipe({ id: 'b' })] });
    queueResult(null);
    await useRecipeStore.getState().deleteRecipe('a');
    expect(useRecipeStore.getState().recipes.map((r) => r.id)).toEqual(['b']);
  });

  it('keeps the recipe when the delete fails', async () => {
    useRecipeStore.setState({ recipes: [recipe({ id: 'a' })] });
    queueResult(null, { message: 'denied' });
    await expect(useRecipeStore.getState().deleteRecipe('a')).rejects.toBeTruthy();
    expect(useRecipeStore.getState().recipes).toHaveLength(1);
  });
});

describe('updateRecipe', () => {
  it('merges changes into the matching recipe only', async () => {
    useRecipeStore.setState({ recipes: [recipe({ id: 'a', title: 'Old' }), recipe({ id: 'b', title: 'Keep' })] });
    queueResult(null);
    await useRecipeStore.getState().updateRecipe('a', { title: 'New' });
    expect(useRecipeStore.getState().recipes.map((r) => r.title)).toEqual(['New', 'Keep']);
  });
});

describe('startPolling', () => {
  it('marks the recipe as processing and clears it once tags and nutrition arrive', async () => {
    vi.useFakeTimers();
    useRecipeStore.setState({ recipes: [recipe({ id: 'r1' })] });
    useRecipeStore.getState().startPolling('r1');
    expect(useRecipeStore.getState().processingIds.has('r1')).toBe(true);

    queueResult({ id: 'r1', tags: ['Italian'], nutrition: { calories: 100 } });
    await vi.advanceTimersByTimeAsync(2000);

    expect(useRecipeStore.getState().processingIds.has('r1')).toBe(false);
    expect(useRecipeStore.getState().recipes[0].tags).toEqual(['Italian']);
  });

  it('keeps polling while the AI result is still incomplete', async () => {
    vi.useFakeTimers();
    useRecipeStore.setState({ recipes: [recipe({ id: 'r1' })] });
    useRecipeStore.getState().startPolling('r1');

    queueResult({ id: 'r1', tags: [], nutrition: null });
    await vi.advanceTimersByTimeAsync(2000);
    expect(useRecipeStore.getState().processingIds.has('r1')).toBe(true);
  });

  it('gives up after the 30s timeout so the spinner cannot hang forever', async () => {
    vi.useFakeTimers();
    useRecipeStore.setState({ recipes: [recipe({ id: 'r1' })] });
    useRecipeStore.getState().startPolling('r1');

    for (let elapsed = 0; elapsed <= 32000; elapsed += 2000) {
      queueResult({ id: 'r1', tags: [], nutrition: null });
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(useRecipeStore.getState().processingIds.has('r1')).toBe(false);
  });

  it('does not start a second interval for a recipe already being polled', () => {
    vi.useFakeTimers();
    useRecipeStore.getState().startPolling('r1');
    useRecipeStore.getState().startPolling('r1');
    expect(useRecipeStore.getState().pollingIntervals.size).toBe(1);
  });
});

describe('stopAllPolling', () => {
  it('clears every interval and processing marker', () => {
    vi.useFakeTimers();
    useRecipeStore.getState().startPolling('a');
    useRecipeStore.getState().startPolling('b');
    useRecipeStore.getState().stopAllPolling();
    expect(useRecipeStore.getState().pollingIntervals.size).toBe(0);
    expect(useRecipeStore.getState().processingIds.size).toBe(0);
  });
});

/**
 * The person chips in the vault. The store side of this was correct all along —
 * what broke it was App.tsx passing activeOwnerId to fetchRecipes while leaving
 * it out of the effect's dependency array, so choosing a person never refetched
 * and every recipe stayed on screen. That specific mistake is now a lint error;
 * these cover the query the store is expected to build.
 */
describe('filtering the vault by linked person', () => {
  it('narrows the query to one owner when a person is chosen', async () => {
    queueResult([recipe({ id: 'r1', user_id: 'partner' })]);
    await useRecipeStore.getState().fetchRecipes('', null, null, [], 'newest', 'partner');

    const ownerEq = calls.find(
      (c) => c.table === 'recipes' && c.op === 'eq' && c.args[0] === 'user_id',
    );
    expect(ownerEq?.args[1]).toBe('partner');
  });

  it('does not constrain the owner when no person is chosen', async () => {
    // "Everyone" must stay unfiltered: linked recipes arrive via RLS, so adding
    // a user_id filter here would hide the partner's recipes entirely.
    queueResult([recipe()]);
    await useRecipeStore.getState().fetchRecipes('', null, null, [], 'newest', null);

    const userIdFilters = calls.filter(
      (c) => c.table === 'recipes' && c.op === 'eq' && c.args[0] === 'user_id',
    );
    expect(userIdFilters).toEqual([]);
  });

  it('keeps the owner filter when loading the next page', async () => {
    // loadMore reads the cached filters rather than the arguments, so it is a
    // separate code path and can drift from fetchRecipes.
    queueResult([recipe({ user_id: 'partner' })]);
    await useRecipeStore.getState().fetchRecipes('', null, null, [], 'newest', 'partner');
    calls.length = 0;

    queueResult([recipe({ id: 'r2', user_id: 'partner' })]);
    await useRecipeStore.getState().loadMore();

    const ownerEq = calls.find(
      (c) => c.table === 'recipes' && c.op === 'eq' && c.args[0] === 'user_id',
    );
    expect(ownerEq?.args[1]).toBe('partner');
  });
});
