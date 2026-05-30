import { useCallback } from 'react';
import { useRecipeStore } from '@/store/recipeStore';
import type { ShoppingItem, PantryItem, MealPlan } from '@/types';

export function useShoppingList(userId?: string | null) {
  const store = useRecipeStore();

  const fetchShoppingList = useCallback(async () => {
    await store.fetchShoppingList(userId ?? null);
  }, [store.fetchShoppingList, userId]);

  const fetchPantryItems = useCallback(async () => {
    await store.fetchPantryItems(userId ?? null);
  }, [store.fetchPantryItems, userId]);

  const generateShoppingList = useCallback(
    async (mealPlans: MealPlan[]) => {
      await store.generateShoppingList(mealPlans, userId ?? null);
    },
    [store.generateShoppingList, userId]
  );

  const toggleItem = useCallback(
    async (id: string, checked: boolean) => {
      await store.toggleShoppingItem(id, checked);
    },
    [store.toggleShoppingItem]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      await store.deleteShoppingItem(id);
    },
    [store.deleteShoppingItem]
  );

  const clearAll = useCallback(async () => {
    await store.clearShoppingList(userId ?? null);
  }, [store.clearShoppingList, userId]);

  const moveItemToPantry = useCallback(
    async (item: ShoppingItem) => {
      await store.moveItemToPantry(item, userId ?? null);
    },
    [store.moveItemToPantry, userId]
  );

  const moveItemToShopping = useCallback(
    async (item: PantryItem) => {
      await store.moveItemToShopping(item, userId ?? null);
    },
    [store.moveItemToShopping, userId]
  );

  const deletePantryItem = useCallback(
    async (id: string) => {
      await store.deletePantryItem(id);
    },
    [store.deletePantryItem]
  );

  const addToPantry = useCallback(
    async (item: string, category: string | null = null) => {
      await store.addToPantry(item, userId ?? null, category);
    },
    [store.addToPantry, userId]
  );

  return {
    shoppingList: store.shoppingList,
    pantryItems: store.pantryItems,
    isGeneratingShopping: store.isGeneratingShopping,
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
