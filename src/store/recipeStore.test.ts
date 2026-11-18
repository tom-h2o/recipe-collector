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

// Realtime channels, captured so a test can deliver an event by hand.
interface FakeChannel {
  name: string;
  handler?: (payload: { new?: unknown }) => void;
  subscribed: boolean;
  removed: boolean;
}
const channels: FakeChannel[] = [];

function makeChannel(name: string): FakeChannel {
  const ch: FakeChannel = { name, subscribed: false, removed: false };
  const api = {
    on: (_event: string, _cfg: unknown, handler: (payload: { new?: unknown }) => void) => {
      ch.handler = handler;
      return api;
    },
    subscribe: () => { ch.subscribed = true; return ch; },
  };
  channels.push(ch);
  return api as unknown as FakeChannel;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    channel: (name: string) => makeChannel(name),
    removeChannel: (ch: FakeChannel) => {
      const found = channels.find((c) => c === ch || c.name === ch?.name);
      if (found) found.removed = true;
    },
  },
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
  channels.length = 0;
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
    queueResult([{ id: 'a' }]); // the row the update actually touched
    await useRecipeStore.getState().updateRecipe('a', { title: 'New' });
    expect(useRecipeStore.getState().recipes.map((r) => r.title)).toEqual(['New', 'Keep']);
  });

  it('asks the database which rows it changed', () => {
    // Without .select() the response carries no row count, and an update RLS
    // refused is indistinguishable from one that succeeded.
    useRecipeStore.setState({ recipes: [recipe({ id: 'a' })] });
    queueResult([{ id: 'a' }]);
    return useRecipeStore.getState().updateRecipe('a', { title: 'New' }).then(() => {
      expect(calls.some((c) => c.table === 'recipes' && c.op === 'select')).toBe(true);
    });
  });

  it('rejects when the write changed nothing, instead of reporting success', async () => {
    // Rating a linked account's recipe: the policy refuses the update, Postgres
    // matches zero rows, and PostgREST returns no error. This used to resolve
    // happily and the optimistic merge below painted a change that was never
    // written — it looked saved until the next reload.
    useRecipeStore.setState({ recipes: [recipe({ id: 'a', title: 'Old' })] });
    queueResult([]);
    await expect(useRecipeStore.getState().updateRecipe('a', { title: 'New' })).rejects.toThrow(
      /belongs to someone else/,
    );
  });

  it('leaves the cached recipe untouched when the write changed nothing', async () => {
    useRecipeStore.setState({ recipes: [recipe({ id: 'a', title: 'Old' })] });
    queueResult([]);
    await useRecipeStore.getState().updateRecipe('a', { title: 'New' }).catch(() => {});
    expect(useRecipeStore.getState().recipes[0].title).toBe('Old');
  });
});

describe('startPolling', () => {
  it('marks the recipe as processing and clears it once tags and nutrition arrive', async () => {
    vi.useFakeTimers();
    useRecipeStore.setState({ recipes: [recipe({ id: 'r1' })] });
    useRecipeStore.getState().startPolling('r1');
    expect(useRecipeStore.getState().processingIds.has('r1')).toBe(true);

    queueResult({ id: 'r1', tags: ['Italian'], nutrition: { calories: 100 } });
    await vi.advanceTimersByTimeAsync(5000);

    expect(useRecipeStore.getState().processingIds.has('r1')).toBe(false);
    expect(useRecipeStore.getState().recipes[0].tags).toEqual(['Italian']);
  });

  it('keeps polling while the AI result is still incomplete', async () => {
    vi.useFakeTimers();
    useRecipeStore.setState({ recipes: [recipe({ id: 'r1' })] });
    useRecipeStore.getState().startPolling('r1');

    queueResult({ id: 'r1', tags: [], nutrition: null });
    await vi.advanceTimersByTimeAsync(5000);
    expect(useRecipeStore.getState().processingIds.has('r1')).toBe(true);
  });

  it('gives up after the 30s timeout so the spinner cannot hang forever', async () => {
    vi.useFakeTimers();
    useRecipeStore.setState({ recipes: [recipe({ id: 'r1' })] });
    useRecipeStore.getState().startPolling('r1');

    for (let elapsed = 0; elapsed <= 35000; elapsed += 5000) {
      queueResult({ id: 'r1', tags: [], nutrition: null });
      await vi.advanceTimersByTimeAsync(5000);
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

/**
 * Realtime is the fast path; the poll is the net under it. Both have to be
 * able to finish the job alone, because the ways Realtime goes quiet — a table
 * missing from the publication, a blocked websocket, a lost event — all look
 * identical to "still processing" from the client.
 */
describe('startPolling: the Realtime fast path', () => {
  it('subscribes to updates for exactly that recipe', () => {
    vi.useFakeTimers();
    useRecipeStore.getState().startPolling('r1');

    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe('recipe-processing:r1');
    expect(channels[0].subscribed).toBe(true);
  });

  it('clears the spinner the moment the event lands, without waiting for a poll', async () => {
    vi.useFakeTimers();
    useRecipeStore.setState({ recipes: [recipe({ id: 'r1' })] });
    useRecipeStore.getState().startPolling('r1');
    expect(useRecipeStore.getState().processingIds.has('r1')).toBe(true);

    // No timer advanced at all: this is what Realtime buys.
    channels[0].handler?.({ new: { id: 'r1', tags: ['Italian'], nutrition: { calories: 100 } } });

    expect(useRecipeStore.getState().processingIds.has('r1')).toBe(false);
    expect(useRecipeStore.getState().recipes[0].tags).toEqual(['Italian']);
  });

  it('ignores an update that arrives before the AI pass has finished', () => {
    vi.useFakeTimers();
    useRecipeStore.setState({ recipes: [recipe({ id: 'r1' })] });
    useRecipeStore.getState().startPolling('r1');

    // Any other write to the row — a rename, a favourite — also fires here.
    channels[0].handler?.({ new: { id: 'r1', tags: [], nutrition: null } });

    expect(useRecipeStore.getState().processingIds.has('r1')).toBe(true);
  });

  it('tears the subscription down once it has fired', () => {
    vi.useFakeTimers();
    useRecipeStore.setState({ recipes: [recipe({ id: 'r1' })] });
    useRecipeStore.getState().startPolling('r1');

    channels[0].handler?.({ new: { id: 'r1', tags: ['x'], nutrition: {} } });

    expect(channels[0].removed).toBe(true);
    expect(useRecipeStore.getState().realtimeChannels.size).toBe(0);
    expect(useRecipeStore.getState().pollingIntervals.size).toBe(0);
  });

  it('still finishes through the poll when Realtime never delivers', async () => {
    // The publication is missing, or the socket is blocked: the channel
    // subscribes and then says nothing. This is the case the net exists for.
    vi.useFakeTimers();
    useRecipeStore.setState({ recipes: [recipe({ id: 'r1' })] });
    useRecipeStore.getState().startPolling('r1');

    queueResult({ id: 'r1', tags: ['Italian'], nutrition: { calories: 100 } });
    await vi.advanceTimersByTimeAsync(5000);

    expect(useRecipeStore.getState().processingIds.has('r1')).toBe(false);
    expect(channels[0].removed).toBe(true);
  });

  it('does not double-finish when both paths report the same recipe', async () => {
    vi.useFakeTimers();
    useRecipeStore.setState({ recipes: [recipe({ id: 'r1' })] });
    useRecipeStore.getState().startPolling('r1');

    channels[0].handler?.({ new: { id: 'r1', tags: ['Italian'], nutrition: { calories: 100 } } });
    // A poll already in flight resolves afterwards; finish() must no-op.
    queueResult({ id: 'r1', tags: ['Italian'], nutrition: { calories: 100 } });
    await vi.advanceTimersByTimeAsync(5000);

    expect(useRecipeStore.getState().processingIds.size).toBe(0);
    expect(useRecipeStore.getState().recipes[0].tags).toEqual(['Italian']);
  });

  it('starts one subscription per recipe, not one per call', () => {
    vi.useFakeTimers();
    useRecipeStore.getState().startPolling('r1');
    useRecipeStore.getState().startPolling('r1');
    expect(channels).toHaveLength(1);
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

  it('also closes the Realtime subscriptions, so they do not outlive the page', () => {
    vi.useFakeTimers();
    useRecipeStore.getState().startPolling('a');
    useRecipeStore.getState().startPolling('b');
    useRecipeStore.getState().stopAllPolling();

    expect(useRecipeStore.getState().realtimeChannels.size).toBe(0);
    expect(channels.every((c) => c.removed)).toBe(true);
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
