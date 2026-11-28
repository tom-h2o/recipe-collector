import { useCallback } from 'react';
import { useRecipeStore } from '@/store/recipeStore';

export function useMealPlans(userId?: string | null) {
  const mealPlans = useRecipeStore((state) => state.mealPlans);

  const fetchMealPlans = useCallback(async () => {
    await useRecipeStore.getState().fetchMealPlans();
  }, []);

  const addMealPlan = useCallback(
    async (date: string, mealType: string, recipeId: string) => {
      await useRecipeStore.getState().addMealPlan(date, mealType, recipeId, userId ?? null);
    },
    [userId]
  );

  const removeMealPlan = useCallback(
    async (id: string) => {
      await useRecipeStore.getState().removeMealPlan(id);
    },
    []
  );

  const updateMealPlan = useCallback(
    async (id: string, changes: { servings?: number | null; in_shopping?: boolean }) =>
      useRecipeStore.getState().updateMealPlan(id, changes),
    []
  );

  return {
    mealPlans,
    fetchMealPlans,
    addMealPlan,
    removeMealPlan,
    updateMealPlan,
  };
}
