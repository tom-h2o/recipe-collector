import { useCallback } from 'react';
import { useRecipeStore } from '@/store/recipeStore';
import type { ShoppingItem, PantryItem, MealPlan } from '@/types';

export function useShoppingList(userId?: string | null) {
  const shoppingList = useRecipeStore((state) => state.shoppingList);
  const pantryItems = useRecipeStore((state) => state.pantryItems);
  const isGeneratingShopping = useRecipeStore((state) => state.isGeneratingShopping);

  const fetchShoppingList = useCallback(async () => {
    await useRecipeStore.getState().fetchShoppingList(userId ?? null);
  }, [userId]);

  const fetchPantryItems = useCallback(async () => {
    await useRecipeStore.getState().fetchPantryItems(userId ?? null);
  }, [userId]);

  const generateShoppingList = useCallback(
    async (mealPlans: MealPlan[]) => {
      await useRecipeStore.getState().generateShoppingList(mealPlans, userId ?? null);
    },
    [userId]
  );

  const toggleItem = useCallback(
    async (id: string, checked: boolean) => {
      await useRecipeStore.getState().toggleShoppingItem(id, checked);
    },
    []
  );

  const deleteItem = useCallback(
    async (id: string) => {
      await useRecipeStore.getState().deleteShoppingItem(id);
    },
    []
  );

  const clearAll = useCallback(async () => {
    await useRecipeStore.getState().clearShoppingList(userId ?? null);
  }, [userId]);

  const moveItemToPantry = useCallback(
    async (item: ShoppingItem) => {
      await useRecipeStore.getState().moveItemToPantry(item, userId ?? null);
    },
    [userId]
  );

  const moveItemToShopping = useCallback(
    async (item: PantryItem) => {
      await useRecipeStore.getState().moveItemToShopping(item, userId ?? null);
    },
    [userId]
  );

  const deletePantryItem = useCallback(
    async (id: string) => {
      await useRecipeStore.getState().deletePantryItem(id);
    },
    []
  );

  const addToPantry = useCallback(
    async (item: string, category: string | null = null) => {
      await useRecipeStore.getState().addToPantry(item, userId ?? null, category);
    },
    [userId]
  );

  return {
    shoppingList,
    pantryItems,
    isGeneratingShopping,
    fetchShoppingList,
    fetchPantryItems,
    generateShoppingList,
    toggleItem,
    deleteItem,
    clearAll,
    moveItemToPantry,
    moveItemToShopping,
    deletePantryItem,
    addToPantry,
  };
}
