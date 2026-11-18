import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Which languages a recipe has already been translated into, and a way to
 * throw one away.
 *
 * Translations are cached in recipe_translations and cost a Gemini call to
 * create, so knowing which ones exist is the difference between re-reading a
 * cached result and spending another call from the daily allowance. The
 * language picker had no way to show that, so every language looked identical
 * whether it was free or not.
 */
export function useRecipeTranslations(recipeId: string | null, canDelete: boolean) {
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchLanguages = useCallback(async () => {
    if (!recipeId) { setLanguages([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('recipe_translations')
      .select('language_code')
      .eq('recipe_id', recipeId);
    setLanguages((data ?? []).map((r) => r.language_code as string));
    setLoading(false);
  }, [recipeId]);

  useEffect(() => { fetchLanguages(); }, [fetchLanguages]);

  /**
   * Returns true when the row is really gone.
   *
   * .select() is load-bearing: a delete the policy refuses matches zero rows
   * and comes back with no error at all, so without asking for the affected
   * rows this would report success while the translation stayed exactly where
   * it was.
   */
  const remove = useCallback(async (languageCode: string): Promise<boolean> => {
    if (!recipeId || !canDelete) return false;
    setRemoving(languageCode);
    try {
      const { data, error } = await supabase
        .from('recipe_translations')
        .delete()
        .eq('recipe_id', recipeId)
        .eq('language_code', languageCode)
        .select('id');

      if (error || !data || data.length === 0) return false;
      setLanguages((prev) => prev.filter((c) => c !== languageCode));
      return true;
    } finally {
      setRemoving(null);
    }
  }, [recipeId, canDelete]);

  return { languages, loading, removing, remove, refresh: fetchLanguages };
}
