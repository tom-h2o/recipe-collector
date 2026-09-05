import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface RecipeRating {
  recipe_id: string;
  user_id: string;
  rating: number;
}

/**
 * Ratings for one recipe, from everyone the viewer is allowed to see.
 *
 * RLS returns the viewer's own row plus those of linked accounts, so this does
 * no filtering of its own — narrowing here would only hide rows the policy
 * already decided were visible.
 */
export function useRecipeRatings(recipeId: string | null, userId: string | null) {
  const [ratings, setRatings] = useState<RecipeRating[]>([]);
  const [busy, setBusy] = useState(false);

  const fetchRatings = useCallback(async () => {
    if (!recipeId) { setRatings([]); return; }
    const { data } = await supabase
      .from('recipe_ratings')
      .select('recipe_id, user_id, rating')
      .eq('recipe_id', recipeId);
    setRatings((data as RecipeRating[]) ?? []);
  }, [recipeId]);

  useEffect(() => { void fetchRatings(); }, [fetchRatings]);

  const myRating = userId ? (ratings.find((r) => r.user_id === userId)?.rating ?? null) : null;
  const otherRatings = ratings.filter((r) => r.user_id !== userId);

  /** Sets the viewer's own rating, or clears it when passed null. */
  const setRating = useCallback(
    async (value: number | null) => {
      if (!recipeId || !userId) return;
      setBusy(true);
      try {
        if (value === null) {
          await supabase.from('recipe_ratings').delete().eq('recipe_id', recipeId).eq('user_id', userId);
        } else {
          // user_id is part of the primary key, so this upserts the viewer's own
          // row and can never overwrite anyone else's.
          await supabase
            .from('recipe_ratings')
            .upsert({ recipe_id: recipeId, user_id: userId, rating: value, updated_at: new Date().toISOString() });
        }
        await fetchRatings();
      } finally {
        setBusy(false);
      }
    },
    [recipeId, userId, fetchRatings],
  );

  return { ratings, myRating, otherRatings, busy, fetchRatings, setRating };
}
