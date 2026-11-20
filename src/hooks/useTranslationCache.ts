import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Recipe, RecipeTranslation } from '@/types';

export function useTranslationCache(recipes: Recipe[]) {
  const [cache, setCache] = useState<Record<string, RecipeTranslation>>({});
  const [isLoading, setIsLoading] = useState(false);
  // Track which recipe IDs we've already queried so toggling a favourite
  // (or any other recipes update) never re-fires the same Supabase query.
  const fetchedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const toFetch = recipes.filter(
      (r) => r.preferred_language && !fetchedIds.current.has(r.id),
    );
    if (toFetch.length === 0) return;

    // Mark as fetched before the query to guard against concurrent effect calls.
    toFetch.forEach((r) => fetchedIds.current.add(r.id));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);

    void supabase
      .from('recipe_translations')
      .select('*')
      .in('recipe_id', toFetch.map((r) => r.id))
      .then(({ data }) => {
        if (data?.length) {
          setCache((prev) => {
            const next = { ...prev };
            for (const t of data) {
              const key = `${t.recipe_id}:${t.language_code}`;
              if (!next[key]) next[key] = t as RecipeTranslation;
            }
            return next;
          });
        }
      })
      .then(() => setIsLoading(false), () => setIsLoading(false));
  }, [recipes]);

  const cacheTranslation = useCallback(
    (recipeId: string, langCode: string, t: RecipeTranslation) => {
      setCache((prev) => ({ ...prev, [`${recipeId}:${langCode}`]: t }));
    },
    [],
  );

  /**
   * Drops one translation from memory, for when its row has been deleted.
   *
   * Without this a deleted translation was only half gone. The row left the
   * table and the picker stopped ticking the language, but the copy held here
   * stayed, and RecipeDetail prefers this copy over asking the server. So
   * choosing the language again showed the very translation that had just
   * been deleted, and no new one was ever made until the page was reloaded,
   * which is exactly wrong for the one reason anyone deletes a translation:
   * it came out badly and should be done again.
   */
  const forgetTranslation = useCallback((recipeId: string, langCode: string) => {
    setCache((prev) => {
      const key = `${recipeId}:${langCode}`;
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  return { translationsCache: cache, translationsLoading: isLoading, cacheTranslation, forgetTranslation };
}
