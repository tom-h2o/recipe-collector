/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback } from 'react';
import { useRecipeStore } from '@/store/recipeStore';
import type { Recipe } from '@/types';
import type { RecipePayload } from '@/store/recipeStore';

export type { RecipePayload };

export function useRecipes(userId?: string | null) {
  const recipes = useRecipeStore((state) => state.recipes);
  const loading = useRecipeStore((state) => state.loading);
  const processingIds = useRecipeStore((state) => state.processingIds);
  const hasMore = useRecipeStore((state) => state.hasMore);

  const fetchRecipes = useCallback(
    async (
      searchQuery: string = '',
      tagFilter: string | null = null,
      collectionId: string | null = null,
      memberships: any[] = [],
      sortBy: string = 'newest',
      ownerFilter: string | null = null
    ) => {
      await useRecipeStore.getState().fetchRecipes(searchQuery, tagFilter, collectionId, memberships, sortBy, ownerFilter);
    },
    []
  );

  const loadMore = useCallback(async () => {
    await useRecipeStore.getState().loadMore();
  }, []);

  const saveRecipe = useCallback(
    async (payload: RecipePayload, editingId?: string) => {
      return useRecipeStore.getState().saveRecipe(payload, userId ?? null, editingId);
    },
    [userId]
  );

  const deleteRecipe = useCallback(
    async (id: string) => {
      await useRecipeStore.getState().deleteRecipe(id);
    },
    []
  );

  const toggleFavourite = useCallback(
    async (recipe: Recipe) => {
      await useRecipeStore.getState().toggleFavourite(recipe);
    },
    []
  );

  const updateRecipe = useCallback(
    async (id: string, changes: Partial<Recipe>) => {
      await useRecipeStore.getState().updateRecipe(id, changes);
    },
    []
  );

  return {
    recipes,
    loading,
    processingIds,
    hasMore,
    fetchRecipes,
    loadMore,
    saveRecipe,
    deleteRecipe,
    toggleFavourite,
    updateRecipe,
  };
}
