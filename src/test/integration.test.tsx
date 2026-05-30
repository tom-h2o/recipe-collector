/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecipes } from '@/hooks/useRecipes';
import { supabase } from '@/lib/supabase';

// Mock Supabase client
vi.mock('@/lib/supabase', () => {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    textSearch: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({
      data: [
        { id: '1', title: 'Recipe 1', tags: ['Vegetarian'], created_at: '2024-01-01' },
        { id: '2', title: 'Recipe 2', tags: ['Vegan'], created_at: '2024-01-02' }
      ]
    }),
  };

  return {
    supabase: {
      from: vi.fn().mockReturnValue(mockQuery),
    },
  };
});

describe('useRecipes Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches recipes on mount with default parameters', async () => {
    const { result } = renderHook(() => useRecipes('mock-user-123'));

    await act(async () => {
      await result.current.fetchRecipes('');
    });

    expect(supabase.from).toHaveBeenCalledWith('recipes');
    expect(result.current.recipes).toHaveLength(2);
    expect(result.current.recipes[0].title).toBe('Recipe 1');
  });

  it('translates tagFilter parameter into Postgres array query constraints', async () => {
    const { result } = renderHook(() => useRecipes('mock-user-123'));

    await act(async () => {
      await result.current.fetchRecipes('', 'Vegetarian', null, [], 'newest');
    });

    const mockQuery = supabase.from('recipes') as any;
    expect(mockQuery.contains).toHaveBeenCalledWith('tags', ['Vegetarian']);
  });

  it('translates Favourites filter into eq database constraint', async () => {
    const { result } = renderHook(() => useRecipes('mock-user-123'));

    await act(async () => {
      await result.current.fetchRecipes('', '⭐ Favourites', null, [], 'newest');
    });

    const mockQuery = supabase.from('recipes') as any;
    expect(mockQuery.eq).toHaveBeenCalledWith('is_favourite', true);
  });

  it('translates collectionId into IN database query constraints', async () => {
    const { result } = renderHook(() => useRecipes('mock-user-123'));
    const mockMemberships = [
      { collection_id: 'col-1', recipe_id: '1' },
      { collection_id: 'col-1', recipe_id: '3' },
    ];

    await act(async () => {
      await result.current.fetchRecipes('', null, 'col-1', mockMemberships, 'newest');
    });

    const mockQuery = supabase.from('recipes') as any;
    expect(mockQuery.in).toHaveBeenCalledWith('id', ['1', '3']);
  });

  it('applies query sorting parameter to Supabase order constraints', async () => {
    const { result } = renderHook(() => useRecipes('mock-user-123'));

    await act(async () => {
      await result.current.fetchRecipes('', null, null, [], 'a-z');
    });

    const mockQuery = supabase.from('recipes') as any;
    expect(mockQuery.order).toHaveBeenCalledWith('title', { ascending: true });
  });

  it('supports pagination offset range increments on loadMore calls', async () => {
    const { result } = renderHook(() => useRecipes('mock-user-123'));

    // Trigger initial load (page 0)
    await act(async () => {
      await result.current.fetchRecipes('');
    });

    // Trigger next page (page 1)
    await act(async () => {
      await result.current.loadMore();
    });

    const mockQuery = supabase.from('recipes') as any;
    // Page 1 is range PAGE_SIZE (24) to (PAGE_SIZE * 2) - 1 (47)
    expect(mockQuery.range).toHaveBeenLastCalledWith(24, 47);
  });
});
