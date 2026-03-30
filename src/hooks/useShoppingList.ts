import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { parseIngredients } from '@/lib/recipeUtils';
import type { ShoppingItem, PantryItem, MealPlan } from '@/types';

export function useShoppingList(userId?: string | null) {
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [isGeneratingShopping, setIsGeneratingShopping] = useState(false);

  const fetchShoppingList = useCallback(async () => {
    if (!userId) {
      setShoppingList([]);
      return;
    }
    const { data } = await supabase
      .from('shopping_list')
      .select('*')
      .eq('user_id', userId)
      .order('category', { ascending: true });
    if (data) setShoppingList(data as ShoppingItem[]);
  }, [userId]);

  const fetchPantryItems = useCallback(async () => {
    if (!userId) {
      setPantryItems([]);
      return;
    }
    const { data } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('user_id', userId)
      .order('category', { ascending: true });
    if (data) setPantryItems(data as PantryItem[]);
  }, [userId]);

  const generateShoppingList = useCallback(async (mealPlans: MealPlan[]) => {
    setIsGeneratingShopping(true);
    const id = toast.loading('Aggregating ingredients with Gemini AI...');
    try {
      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(today.getDate() + 7);
      const upcoming = mealPlans.filter(
        (m) => new Date(m.date) >= today && new Date(m.date) <= nextWeek,
      );
      if (upcoming.length === 0) throw new Error('No meals planned for the next 7 days!');

      const rawIngredients = upcoming.flatMap((m) =>
        parseIngredients(m.recipe?.ingredients ?? []).map((i) => `${i.amount} ${i.name}`.trim()),
      );

      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: rawIngredients }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await supabase
        .from('shopping_list')
        .delete()
        .eq('user_id', userId);

      const inserts = (data.list as { category: string; items: string[] }[]).flatMap((group) =>
        group.items.map((item) => ({
          category: group.category,
          item,
          is_checked: false,
          ...(userId ? { user_id: userId } : {}),
        })),
      );
      if (inserts.length > 0) await supabase.from('shopping_list').insert(inserts);

      await fetchShoppingList();
      toast.success('Shopping list generated!', { id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate list';
      toast.error(message, { id });
    } finally {
      setIsGeneratingShopping(false);
    }
  }, [fetchShoppingList, userId]);

  const toggleItem = useCallback(async (id: string, checked: boolean) => {
    await supabase.from('shopping_list').update({ is_checked: checked }).eq('id', id);
    setShoppingList((prev) => prev.map((i) => (i.id === id ? { ...i, is_checked: checked } : i)));
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    await supabase.from('shopping_list').delete().eq('id', id);
    setShoppingList((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearAll = useCallback(async () => {
    if (!userId) return;
    await supabase.from('shopping_list').delete().eq('user_id', userId);
    setShoppingList([]);
  }, [userId]);

  // Move a shopping list item to the pantry
  const moveItemToPantry = useCallback(async (item: ShoppingItem) => {
    if (!userId) return;
    const { error } = await supabase
      .from('pantry_items')
      .insert({ user_id: userId, item: item.item, category: item.category });
    if (error) { toast.error('Failed to add to pantry.'); return; }
    await supabase.from('shopping_list').delete().eq('id', item.id);
    setShoppingList((prev) => prev.filter((i) => i.id !== item.id));
    setPantryItems((prev) => [...prev, { id: crypto.randomUUID(), item: item.item, category: item.category, created_at: new Date().toISOString() }]);
  }, [userId]);

  // Move a pantry item back to the shopping list
  const moveItemToShopping = useCallback(async (item: PantryItem) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('shopping_list')
      .insert({ user_id: userId, item: item.item, category: item.category, is_checked: false })
      .select()
      .single();
    if (error) { toast.error('Failed to move to shopping list.'); return; }
    await supabase.from('pantry_items').delete().eq('id', item.id);
    setPantryItems((prev) => prev.filter((i) => i.id !== item.id));
    if (data) setShoppingList((prev) => [...prev, data as ShoppingItem]);
  }, [userId]);

  // Delete a pantry item entirely
  const deletePantryItem = useCallback(async (id: string) => {
    await supabase.from('pantry_items').delete().eq('id', id);
    setPantryItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // Add a custom item directly to the pantry
  const addToPantry = useCallback(async (item: string, category: string | null = null) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('pantry_items')
      .insert({ user_id: userId, item, category })
      .select()
      .single();
    if (error) { toast.error('Failed to add to pantry.'); return; }
    if (data) setPantryItems((prev) => [...prev, data as PantryItem]);
  }, [userId]);

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
