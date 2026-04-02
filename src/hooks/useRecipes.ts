import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { PAGE_SIZE } from '@/lib/constants';
import type { Recipe } from '@/types';

export type RecipePayload = Omit<Recipe, 'id' | 'created_at' | 'tags' | 'is_favourite' | 'nutrition' | 'rating' | 'notes' | 'user_id'>;

export function useRecipes(userId?: string | null) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const currentSearchQuery = useRef<string>('');

  const fetchRecipes = useCallback(async (searchQuery: string = '') => {
    setLoading(true);
    setPage(0);
    currentSearchQuery.current = searchQuery;

    let query = supabase.from('recipes').select('*');

    if (searchQuery && searchQuery.trim()) {
      query = query.textSearch('search_vector', searchQuery.trim());
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data } = await query.range(0, PAGE_SIZE - 1);
    if (data) {
      setRecipes(data as Recipe[]);
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
  }, []);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    let query = supabase.from('recipes').select('*');

    if (currentSearchQuery.current) {
      query = query.textSearch('search_vector', currentSearchQuery.current);
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data } = await query.range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1);
    if (data) {
      setRecipes((prev) => [...prev, ...(data as Recipe[])]);
      setHasMore(data.length === PAGE_SIZE);
      setPage(nextPage);
    }
  }, [page]);

  function startPolling(recipeId: string) {
    setProcessingIds((prev) => new Set([...prev, recipeId]));
    const started = Date.now();
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('recipes')
        .select('id, tags, nutrition')
        .eq('id', recipeId)
        .single();

      const done = data && Array.isArray(data.tags) && data.tags.length > 0 && data.nutrition !== null;
      const timedOut = Date.now() - started > 30000;

      if (done || timedOut) {
        clearInterval(interval);
        pollingRefs.current.delete(recipeId);
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(recipeId);
          return next;
        });
        if (timedOut && !done) {
          toast.warning('Auto-tagging took too long — you can edit tags manually.', { duration: 5000 });
        }
        if (data) {
          setRecipes((prev) => prev.map((r) => (r.id === recipeId ? { ...r, ...data } : r)));
        }
      }
    }, 2000);
    pollingRefs.current.set(recipeId, interval);
  }

  const saveRecipe = useCallback(
    async (payload: RecipePayload, editingId?: string) => {
      if (editingId) {
        const { error } = await supabase.from('recipes').update(payload).eq('id', editingId);
        if (error) throw error;
        setRecipes((prev) => prev.map((r) => (r.id === editingId ? { ...r, ...payload } : r)));
      } else {
        // original_servings is fixed at import time — always mirrors servings on first save
        const withOriginal = { ...payload, original_servings: payload.original_servings ?? payload.servings };
        const insertPayload = userId ? { ...withOriginal, user_id: userId } : withOriginal;
        const { error } = await supabase.from('recipes').insert([insertPayload]);
        if (error) throw error;

        const { data: newRow } = await supabase
          .from('recipes')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (newRow?.id) {
          setRecipes((prev) => [newRow as Recipe, ...prev]);
          startPolling(newRow.id);

          // Auto-find a cover image when none was provided
          if (!payload.image_url) {
            const savedId = newRow.id;
            fetch('/api/find-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: payload.title, description: payload.description }),
            })
              .then((r) => r.json())
              .then(({ imageUrl }: { imageUrl: string }) => {
                if (imageUrl) {
                  supabase.from('recipes').update({ image_url: imageUrl }).eq('id', savedId).then(() => {}, () => {});
                  setRecipes((prev) => prev.map((r) => r.id === savedId ? { ...r, image_url: imageUrl } : r));
                }
              })
              .catch(console.warn);
          }

          fetch('/api/tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipeId: newRow.id,
              title: payload.title,
              description: payload.description,
              ingredients: payload.ingredients,
              instructions: payload.instructions,
            }),
          }).catch(console.warn);
          fetch('/api/nutrition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipeId: newRow.id,
              title: payload.title,
              ingredients: payload.ingredients,
              servings: payload.servings,
            }),
          }).catch(console.warn);
        }
      }
    },
    [userId],
  );

  const deleteRecipe = useCallback(async (id: string) => {
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    if (error) throw error;
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const toggleFavourite = useCallback(async (recipe: Recipe) => {
    const { error } = await supabase
      .from('recipes')
      .update({ is_favourite: !recipe.is_favourite })
      .eq('id', recipe.id);
    if (error) throw error;
    setRecipes((prev) =>
      prev.map((r) => (r.id === recipe.id ? { ...r, is_favourite: !r.is_favourite } : r)),
    );
  }, []);

  const updateRecipe = useCallback(async (id: string, changes: Partial<Recipe>) => {
    const { error } = await supabase.from('recipes').update(changes).eq('id', id);
    if (error) throw error;
    setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  }, []);

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
