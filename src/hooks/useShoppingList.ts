import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { parseIngredients } from '@/lib/recipeUtils';
import type { ShoppingItem, MealPlan } from '@/types';

export function useShoppingList(userId?: string | null) {
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
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

  return {
    shoppingList,
    isGeneratingShopping,
    fetchShoppingList,
    generateShoppingList,
    toggleItem,
    deleteItem,
    clearAll,
  };
}
