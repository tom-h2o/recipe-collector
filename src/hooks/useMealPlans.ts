import { useCallback } from 'react';
import { useRecipeStore } from '@/store/recipeStore';

export function useMealPlans(userId?: string | null) {
  const store = useRecipeStore();

  const fetchMealPlans = useCallback(async () => {
    await store.fetchMealPlans();
  }, [store.fetchMealPlans]);

  const addMealPlan = useCallback(
    async (date: string, mealType: string, recipeId: string) => {
      await store.addMealPlan(date, mealType, recipeId, userId ?? null);
    },
    [store.addMealPlan, userId]
  );

  const removeMealPlan = useCallback(
    async (id: string) => {
      await store.removeMealPlan(id);
    },
    [store.removeMealPlan]
  );

  return {
    mealPlans: store.mealPlans,
    fetchMealPlans,
    addMealPlan,
    removeMealPlan,
  };
}
