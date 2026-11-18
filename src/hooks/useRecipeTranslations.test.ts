import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const state = {
  rows: [] as { language_code: string }[],
  deleteResult: { data: [] as { id: string }[], error: null as unknown },
  deleteFilters: [] as Record<string, unknown>[],
};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (col: string, val: unknown) => { filters[col] = val; return builder; };
      builder.delete = () => { builder.__isDelete = true; return builder; };
      // A select() after delete() resolves to the affected rows.
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (builder.__isDelete) {
          state.deleteFilters.push({ ...filters });
          return Promise.resolve(state.deleteResult).then(resolve);
        }
        return Promise.resolve({ data: state.rows, error: null }).then(resolve);
      };
      return builder;
    },
  },
}));

const { useRecipeTranslations } = await import('./useRecipeTranslations');

beforeEach(() => {
  state.rows = [];
  state.deleteResult = { data: [], error: null };
  state.deleteFilters = [];
});

describe('useRecipeTranslations', () => {
  it('reports which languages are already cached', async () => {
    state.rows = [{ language_code: 'de' }, { language_code: 'fr' }];
    const { result } = renderHook(() => useRecipeTranslations('r1', true));
    await waitFor(() => expect(result.current.languages).toEqual(['de', 'fr']));
  });

  it('asks for nothing when there is no recipe', async () => {
    const { result } = renderHook(() => useRecipeTranslations(null, true));
    await waitFor(() => expect(result.current.languages).toEqual([]));
  });

  it('deletes one language of one recipe, not the whole recipe', async () => {
    state.rows = [{ language_code: 'de' }];
    state.deleteResult = { data: [{ id: 't1' }], error: null };
    const { result } = renderHook(() => useRecipeTranslations('r1', true));
    await waitFor(() => expect(result.current.languages).toEqual(['de']));

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.remove('de'); });

    expect(ok).toBe(true);
    expect(state.deleteFilters[0]).toEqual({ recipe_id: 'r1', language_code: 'de' });
    expect(result.current.languages).toEqual([]);
  });

  it('reports failure when the policy refused the delete', async () => {
    // RLS refusing a delete is silent: zero rows, no error. Without checking
    // the affected rows this would claim success and leave the row in place.
    state.rows = [{ language_code: 'de' }];
    state.deleteResult = { data: [], error: null };
    const { result } = renderHook(() => useRecipeTranslations('r1', true));
    await waitFor(() => expect(result.current.languages).toEqual(['de']));

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.remove('de'); });

    expect(ok).toBe(false);
    // Still listed, because it is still there.
    expect(result.current.languages).toEqual(['de']);
  });

  it('does not even try when the viewer may not delete', async () => {
    // A linked account's recipe: readable, not writable.
    state.rows = [{ language_code: 'de' }];
    const { result } = renderHook(() => useRecipeTranslations('r1', false));
    await waitFor(() => expect(result.current.languages).toEqual(['de']));

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.remove('de'); });

    expect(ok).toBe(false);
    expect(state.deleteFilters).toHaveLength(0);
  });
});
