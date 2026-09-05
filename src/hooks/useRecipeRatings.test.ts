import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const upsert = vi.fn();
const deleteEq = vi.fn();
const selectRows = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => selectRows() }),
      upsert,
      delete: () => ({ eq: (c1: string, v1: string) => ({ eq: (c2: string, v2: string) => deleteEq({ [c1]: v1, [c2]: v2 }) }) }),
    }),
  },
}));

import { useRecipeRatings } from './useRecipeRatings';

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
  deleteEq.mockResolvedValue({ error: null });
  selectRows.mockResolvedValue({ data: [] });
});

describe('useRecipeRatings', () => {
  it('separates the viewer\'s own rating from everyone else\'s', async () => {
    selectRows.mockResolvedValue({
      data: [
        { recipe_id: 'r1', user_id: 'me', rating: 3 },
        { recipe_id: 'r1', user_id: 'partner', rating: 5 },
      ],
    });
    const { result } = renderHook(() => useRecipeRatings('r1', 'me'));

    await waitFor(() => expect(result.current.myRating).toBe(3));
    expect(result.current.otherRatings).toEqual([{ recipe_id: 'r1', user_id: 'partner', rating: 5 }]);
  });

  it('reports no rating of its own when only other people have rated', async () => {
    selectRows.mockResolvedValue({ data: [{ recipe_id: 'r1', user_id: 'partner', rating: 4 }] });
    const { result } = renderHook(() => useRecipeRatings('r1', 'me'));

    await waitFor(() => expect(result.current.otherRatings).toHaveLength(1));
    expect(result.current.myRating).toBeNull();
  });

  it('writes the rating against the viewer, never the recipe owner', async () => {
    // The primary key is (recipe_id, user_id). Pinning user_id to the viewer is
    // what makes rating a linked account's recipe safe: it adds a row rather
    // than overwriting theirs.
    const { result } = renderHook(() => useRecipeRatings('r1', 'me'));
    await act(async () => { await result.current.setRating(4); });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ recipe_id: 'r1', user_id: 'me', rating: 4 }),
    );
  });

  it('clears by deleting only the viewer\'s own row', async () => {
    const { result } = renderHook(() => useRecipeRatings('r1', 'me'));
    await act(async () => { await result.current.setRating(null); });

    expect(upsert).not.toHaveBeenCalled();
    expect(deleteEq).toHaveBeenCalledWith({ recipe_id: 'r1', user_id: 'me' });
  });

  it('does nothing when signed out', async () => {
    const { result } = renderHook(() => useRecipeRatings('r1', null));
    await act(async () => { await result.current.setRating(4); });

    expect(upsert).not.toHaveBeenCalled();
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it('does not filter the rows RLS returned', async () => {
    // The select carries no user_id predicate: the policy already decided which
    // ratings are visible, and narrowing again here would hide linked accounts.
    selectRows.mockResolvedValue({ data: [{ recipe_id: 'r1', user_id: 'partner', rating: 2 }] });
    const { result } = renderHook(() => useRecipeRatings('r1', 'me'));
    await waitFor(() => expect(result.current.ratings).toHaveLength(1));
  });
});
