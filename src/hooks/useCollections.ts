import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Collection, RecipeCollection } from '@/types';

export function useCollections(userId?: string | null) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [memberships, setMemberships] = useState<RecipeCollection[]>([]);

  const fetchCollections = useCallback(async () => {
    if (!userId) return;
    const { data: cols } = await supabase
      .from('collections')
      .select('*')
      .order('created_at', { ascending: true });
    const { data: mems } = await supabase
      .from('recipe_collections')
      .select('collection_id, recipe_id');
    if (cols) setCollections(cols as Collection[]);
    if (mems) setMemberships(mems as RecipeCollection[]);
  }, [userId]);

  const createCollection = useCallback(async (name: string) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('collections')
      .insert({ name: name.trim(), user_id: userId })
      .select()
      .single();
    if (error) throw error;
    setCollections((prev) => [...prev, data as Collection]);
  }, [userId]);

  const deleteCollection = useCallback(async (id: string) => {
    const { error } = await supabase.from('collections').delete().eq('id', id);
    if (error) throw error;
    setCollections((prev) => prev.filter((c) => c.id !== id));
    setMemberships((prev) => prev.filter((m) => m.collection_id !== id));
  }, []);

  const addToCollection = useCallback(async (collectionId: string, recipeId: string) => {
    const { error } = await supabase
      .from('recipe_collections')
      .insert({ collection_id: collectionId, recipe_id: recipeId });
    if (error) throw error;
    setMemberships((prev) => [...prev, { collection_id: collectionId, recipe_id: recipeId }]);
  }, []);

  const removeFromCollection = useCallback(async (collectionId: string, recipeId: string) => {
    const { error } = await supabase
      .from('recipe_collections')
      .delete()
      .eq('collection_id', collectionId)
      .eq('recipe_id', recipeId);
    if (error) throw error;
    setMemberships((prev) =>
      prev.filter((m) => !(m.collection_id === collectionId && m.recipe_id === recipeId)),
    );
  }, []);

  return {
    collections,
    memberships,
    fetchCollections,
    createCollection,
    deleteCollection,
    addToCollection,
    removeFromCollection,
  };
}
