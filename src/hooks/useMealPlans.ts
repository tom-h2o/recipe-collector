import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { MealPlan } from '@/types';

export function useMealPlans(userId?: string | null) {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);

  const fetchMealPlans = useCallback(async () => {
    const { data } = await supabase
      .from('meal_plan')
      .select('*, recipe:recipes(*)')
      .order('date', { ascending: true });
    if (data) setMealPlans(data as MealPlan[]);
  }, []);

  const addMealPlan = useCallback(async (date: string, mealType: string, recipeId: string) => {
    const payload = userId
      ? { date, meal_type: mealType, recipe_id: recipeId, user_id: userId }
      : { date, meal_type: mealType, recipe_id: recipeId };
    const { error } = await supabase.from('meal_plan').insert(payload);
    if (error) throw error;
  }, [userId]);

  const removeMealPlan = useCallback(async (id: string) => {
    const { error } = await supabase.from('meal_plan').delete().eq('id', id);
    if (error) throw error;
    setMealPlans((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { mealPlans, fetchMealPlans, addMealPlan, removeMealPlan };
}
