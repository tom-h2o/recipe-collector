import { useCallback } from 'react';
import { useRecipeStore } from '@/store/recipeStore';
import type { Recipe } from '@/types';
import type { RecipePayload } from '@/store/recipeStore';

export type { RecipePayload };

export function useRecipes(userId?: string | null) {
  const store = useRecipeStore();

  const fetchRecipes = useCallback(
    async (
      searchQuery: string = '',
      tagFilter: string | null = null,
      collectionId: string | null = null,
      memberships: any[] = [],
      sortBy: string = 'newest'
    ) => {
      await store.fetchRecipes(searchQuery, tagFilter, collectionId, memberships, sortBy);
    },
    [store.fetchRecipes]
  );

  const loadMore = useCallback(async () => {
    await store.loadMore();
  }, [store.loadMore]);

  const saveRecipe = useCallback(
    async (payload: RecipePayload, editingId?: string) => {
      await store.saveRecipe(payload, userId ?? null, editingId);
    },
    [store.saveRecipe, userId]
  );

  const deleteRecipe = useCallback(
    async (id: string) => {
      await store.deleteRecipe(id);
    },
    [store.deleteRecipe]
  );

  const toggleFavourite = useCallback(
    async (recipe: Recipe) => {
      await store.toggleFavourite(recipe);
    },
    [store.toggleFavourite]
  );

  const updateRecipe = useCallback(
    async (id: string, changes: Partial<Recipe>) => {
      await store.updateRecipe(id, changes);
    },
    [store.updateRecipe]
  );

  return {
    recipes: store.recipes,
    loading: store.loading,
    processingIds: store.processingIds,
    hasMore: store.hasMore,
    fetchRecipes,
    loadMore,
    saveRecipe,
    deleteRecipe,
    toggleFavourite,
    updateRecipe,
  };
}
