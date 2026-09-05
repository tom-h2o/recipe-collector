/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { PAGE_SIZE } from '@/lib/constants';
import { parseIngredients } from '@/lib/recipeUtils';
import type { Recipe, MealPlan, ShoppingItem, PantryItem } from '@/types';

export type RecipePayload = Omit<Recipe, 'id' | 'created_at' | 'tags' | 'is_favourite' | 'nutrition' | 'rating' | 'notes' | 'user_id'>;

interface RecipeState {
  // Recipes
  recipes: Recipe[];
  loading: boolean;
  processingIds: Set<string>;
  page: number;
  hasMore: boolean;
  
  // Cache filters for loadMore
  currentSearchQuery: string;
  currentTagFilter: string | null;
  currentCollectionId: string | null;
  currentMemberships: any[];
  currentSortBy: string;
  /** Narrows the vault to one linked person, or null for everyone visible. */
  currentOwnerFilter: string | null;

  // Polling intervals tracker (in-memory, outside React lifecycle)
  pollingIntervals: Map<string, ReturnType<typeof setInterval>>;

  // Recipes Actions
  fetchRecipes: (
    searchQuery?: string,
    tagFilter?: string | null,
    collectionId?: string | null,
    memberships?: any[],
    sortBy?: string,
    ownerFilter?: string | null
  ) => Promise<void>;
  loadMore: () => Promise<void>;
  /** Resolves to the saved recipe's id, so callers can attach gallery images. */
  saveRecipe: (payload: RecipePayload, userId: string | null, editingId?: string) => Promise<string | undefined>;
  deleteRecipe: (id: string) => Promise<void>;
  toggleFavourite: (recipe: Recipe) => Promise<void>;
  updateRecipe: (id: string, changes: Partial<Recipe>) => Promise<void>;
  startPolling: (recipeId: string) => void;
  stopAllPolling: () => void;

  // Meal Plans
  mealPlans: MealPlan[];
  fetchMealPlans: () => Promise<void>;
  addMealPlan: (date: string, mealType: string, recipeId: string, userId: string | null) => Promise<void>;
  removeMealPlan: (id: string) => Promise<void>;

  // Shopping / Pantry
  shoppingList: ShoppingItem[];
  pantryItems: PantryItem[];
  isGeneratingShopping: boolean;
  fetchShoppingList: (userId: string | null) => Promise<void>;
  fetchPantryItems: (userId: string | null) => Promise<void>;
  generateShoppingList: (mealPlans: MealPlan[], userId: string | null) => Promise<void>;
  toggleShoppingItem: (id: string, checked: boolean) => Promise<void>;
  deleteShoppingItem: (id: string) => Promise<void>;
  clearShoppingList: (userId: string | null) => Promise<void>;
  moveItemToPantry: (item: ShoppingItem, userId: string | null) => Promise<void>;
  moveItemToShopping: (item: PantryItem, userId: string | null) => Promise<void>;
  deletePantryItem: (id: string) => Promise<void>;
  addToPantry: (item: string, userId: string | null, category?: string | null) => Promise<void>;
}

/**
 * Recipes the user has adopted from a linked account keep a pointer to the
 * original. The original is then hidden from their vault so the same dish is not
 * listed twice — once as theirs, once as the other person's.
 *
 * Applied as a query filter rather than after fetching, because the vault
 * paginates server-side and post-filtering would return short pages.
 */
async function getAdoptedOriginalIds(): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('recipes')
      .select('copied_from_recipe_id')
      .not('copied_from_recipe_id', 'is', null);
    return (data ?? [])
      .map((r) => r.copied_from_recipe_id as string | null)
      .filter((id): id is string => !!id);
  } catch {
    // Failing open only means an original may appear beside its copy, which is
    // untidy rather than wrong — unlike visibility, where failing closed matters.
    return [];
  }
}

export const useRecipeStore = create<RecipeState>((set, get) => ({
  recipes: [],
  loading: true,
  processingIds: new Set<string>(),
  page: 0,
  hasMore: false,
  currentSearchQuery: '',
  currentTagFilter: null,
  currentCollectionId: null,
  currentMemberships: [],
  currentSortBy: 'newest',
  currentOwnerFilter: null,
  pollingIntervals: new Map(),

  // Meal Plans
  mealPlans: [],

  // Shopping
  shoppingList: [],
  pantryItems: [],
  isGeneratingShopping: false,

  fetchRecipes: async (
    searchQuery = '',
    tagFilter = null,
    collectionId = null,
    memberships = [],
    sortBy = 'newest',
    ownerFilter = null
  ) => {
    set({
      loading: true,
      page: 0,
      currentSearchQuery: searchQuery,
      currentTagFilter: tagFilter,
      currentCollectionId: collectionId,
      currentMemberships: memberships,
      currentSortBy: sortBy,
      currentOwnerFilter: ownerFilter,
    });

    let query = supabase.from('recipes').select('*');

    // Linked accounts' recipes arrive via RLS; the chip narrows to one owner.
    if (ownerFilter) query = query.eq('user_id', ownerFilter);

    const adoptedIds = await getAdoptedOriginalIds();
    if (adoptedIds.length > 0) query = query.not('id', 'in', `(${adoptedIds.join(',')})`);

    if (searchQuery && searchQuery.trim()) {
      query = query.textSearch('search_vector', searchQuery.trim());
    }

    if (tagFilter) {
      if (tagFilter === '⭐ Favourites') {
        query = query.eq('is_favourite', true);
      } else {
        query = query.contains('tags', [tagFilter]);
      }
    }

    if (collectionId) {
      const ids = memberships.filter((m) => m.collection_id === collectionId).map((m) => m.recipe_id);
      query = query.in('id', ids);
    }

    // Apply sorting
    switch (sortBy) {
      case 'oldest': query = query.order('created_at', { ascending: true }); break;
      case 'a-z': query = query.order('title', { ascending: true }); break;
      case 'z-a': query = query.order('title', { ascending: false }); break;
      case 'rating': query = query.order('rating', { ascending: false, nullsFirst: false }); break;
      case 'favourites': query = query.order('is_favourite', { ascending: false }).order('created_at', { ascending: false }); break;
      default: query = query.order('created_at', { ascending: false }); break;
    }

    const { data } = await query.range(0, PAGE_SIZE - 1);
    if (data) {
      set({
        recipes: data as Recipe[],
        hasMore: data.length === PAGE_SIZE,
      });
    }
    set({ loading: false });
  },

  loadMore: async () => {
    const { page, recipes, currentSearchQuery, currentTagFilter, currentCollectionId, currentMemberships, currentSortBy, currentOwnerFilter } = get();
    const nextPage = page + 1;
    let query = supabase.from('recipes').select('*');

    // Linked accounts' recipes arrive via RLS; the chip narrows to one owner.
    if (currentOwnerFilter) query = query.eq("user_id", currentOwnerFilter);

    const adoptedIds = await getAdoptedOriginalIds();
    if (adoptedIds.length > 0) query = query.not('id', 'in', `(${adoptedIds.join(',')})`);

    if (currentSearchQuery) {
      query = query.textSearch('search_vector', currentSearchQuery);
    }
    if (currentTagFilter) {
      if (currentTagFilter === '⭐ Favourites') {
        query = query.eq('is_favourite', true);
      } else {
        query = query.contains('tags', [currentTagFilter]);
      }
    }
    if (currentCollectionId) {
      const ids = currentMemberships.filter((m) => m.collection_id === currentCollectionId).map((m) => m.recipe_id);
      query = query.in('id', ids);
    }

    // Apply sorting
    switch (currentSortBy) {
      case 'oldest': query = query.order('created_at', { ascending: true }); break;
      case 'a-z': query = query.order('title', { ascending: true }); break;
      case 'z-a': query = query.order('title', { ascending: false }); break;
      case 'rating': query = query.order('rating', { ascending: false, nullsFirst: false }); break;
      case 'favourites': query = query.order('is_favourite', { ascending: false }).order('created_at', { ascending: false }); break;
      default: query = query.order('created_at', { ascending: false }); break;
    }

    const { data } = await query.range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1);
    if (data) {
      set({
        recipes: [...recipes, ...(data as Recipe[])],
        hasMore: data.length === PAGE_SIZE,
        page: nextPage,
      });
    }
  },

  startPolling: (recipeId: string) => {
    const { pollingIntervals, processingIds } = get();
    if (pollingIntervals.has(recipeId)) return;

    const nextProcessing = new Set(processingIds);
    nextProcessing.add(recipeId);
    set({ processingIds: nextProcessing });

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
        const currentIntervals = get().pollingIntervals;
        currentIntervals.delete(recipeId);
        set({ pollingIntervals: new Map(currentIntervals) });

        const nextProcessingIds = new Set(get().processingIds);
        nextProcessingIds.delete(recipeId);
        set({ processingIds: nextProcessingIds });

        if (timedOut && !done) {
          toast.warning('Auto-tagging took too long — you can edit tags manually.', { duration: 5000 });
        }
        if (data) {
          set({
            recipes: get().recipes.map((r) => (r.id === recipeId ? { ...r, ...data } : r))
          });
        }
      }
    }, 2000);

    const currentIntervals = get().pollingIntervals;
    currentIntervals.set(recipeId, interval);
    set({ pollingIntervals: new Map(currentIntervals) });
  },

  stopAllPolling: () => {
    const { pollingIntervals } = get();
    pollingIntervals.forEach((interval) => clearInterval(interval));
    set({
      pollingIntervals: new Map(),
      processingIds: new Set(),
    });
  },

  saveRecipe: async (payload, userId, editingId) => {
    if (editingId) {
      const { error } = await supabase.from('recipes').update(payload).eq('id', editingId);
      if (error) throw error;
      set({
        recipes: get().recipes.map((r) => (r.id === editingId ? { ...r, ...payload } : r))
      });
      return editingId;
    } else {
      const withOriginal = { ...payload, original_servings: payload.original_servings ?? payload.servings };
      const insertPayload = userId ? { ...withOriginal, user_id: userId } : withOriginal;
      const { data: newRow, error } = await supabase
        .from('recipes')
        .insert([insertPayload])
        .select('*')
        .single();
      if (error) throw error;

      if (newRow?.id) {
        set({
          recipes: [newRow as Recipe, ...get().recipes]
        });
        get().startPolling(newRow.id);

        // Auto-find cover image when none was provided
        if (!payload.image_url) {
          const savedId = newRow.id;
          apiFetch('/api/find-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: payload.title, description: payload.description }),
          })
            .then((r) => r.json())
            .then(({ imageUrl }: { imageUrl: string }) => {
              if (imageUrl) {
                supabase.from('recipes').update({ image_url: imageUrl }).eq('id', savedId).then(() => {}, () => {});
                set({
                  recipes: get().recipes.map((r) => r.id === savedId ? { ...r, image_url: imageUrl } : r)
                });
              }
            })
            .catch(console.warn);
        }

        apiFetch('/api/tag', {
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

        apiFetch('/api/nutrition', {
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

      return newRow?.id as string | undefined;
    }
  },

  deleteRecipe: async (id) => {
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    if (error) throw error;
    set({
      recipes: get().recipes.filter((r) => r.id !== id)
    });
  },

  toggleFavourite: async (recipe) => {
    const { error } = await supabase
      .from('recipes')
      .update({ is_favourite: !recipe.is_favourite })
      .eq('id', recipe.id);
    if (error) throw error;
    set({
      recipes: get().recipes.map((r) => (r.id === recipe.id ? { ...r, is_favourite: !r.is_favourite } : r))
    });
  },

  updateRecipe: async (id, changes) => {
    // .select() matters: an update the RLS policy forbids matches zero rows and
    // comes back with no error at all, so without asking for the affected rows
    // this reported success and the optimistic set() below painted a change that
    // was never written. Rating a linked account's recipe did exactly that — it
    // looked saved until the next reload.
    const { data, error } = await supabase.from('recipes').update(changes).eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('That recipe belongs to someone else, so the change was not saved.');
    }
    set({
      recipes: get().recipes.map((r) => (r.id === id ? { ...r, ...changes } : r))
    });
  },

  // Meal Plans implementation
  fetchMealPlans: async () => {
    const { data } = await supabase
      .from('meal_plan')
      .select('*, recipe:recipes(*)')
      .order('date', { ascending: true });
    if (data) {
      set({ mealPlans: data as MealPlan[] });
    }
  },

  addMealPlan: async (date, mealType, recipeId, userId) => {
    const payload = userId
      ? { date, meal_type: mealType, recipe_id: recipeId, user_id: userId }
      : { date, meal_type: mealType, recipe_id: recipeId };
    const { error } = await supabase.from('meal_plan').insert(payload);
    if (error) throw error;
    // Fast local refetch to keep visual lists fresh
    await get().fetchMealPlans();
  },

  removeMealPlan: async (id) => {
    const { error } = await supabase.from('meal_plan').delete().eq('id', id);
    if (error) throw error;
    set({
      mealPlans: get().mealPlans.filter((m) => m.id !== id)
    });
  },

  // Shopping List / Pantry implementation
  fetchShoppingList: async (userId) => {
    if (!userId) {
      set({ shoppingList: [] });
      return;
    }
    const { data } = await supabase
      .from('shopping_list')
      .select('*')
      .eq('user_id', userId)
      .order('category', { ascending: true });
    if (data) {
      set({ shoppingList: data as ShoppingItem[] });
    }
  },

  fetchPantryItems: async (userId) => {
    if (!userId) {
      set({ pantryItems: [] });
      return;
    }
    const { data } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('user_id', userId)
      .order('category', { ascending: true });
    if (data) {
      set({ pantryItems: data as PantryItem[] });
    }
  },

  generateShoppingList: async (mealPlans, userId) => {
    set({ isGeneratingShopping: true });
    const toastId = toast.loading('Aggregating ingredients with Gemini AI...');
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

      const res = await apiFetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: rawIngredients }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const { error: deleteError } = await supabase
        .from('shopping_list')
        .delete()
        .eq('user_id', userId);
      if (deleteError) throw deleteError;

      const inserts = (data.list as { category: string; items: string[] }[]).flatMap((group) =>
        group.items.map((item) => ({
          category: group.category,
          item,
          is_checked: false,
          ...(userId ? { user_id: userId } : {}),
        })),
      );
      if (inserts.length > 0) {
        const { error: insertError } = await supabase.from('shopping_list').insert(inserts);
        if (insertError) throw insertError;
      }

      await get().fetchShoppingList(userId);
      toast.success('Shopping list generated!', { id: toastId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate list';
      toast.error(message, { id: toastId });
    } finally {
      set({ isGeneratingShopping: false });
    }
  },

  toggleShoppingItem: async (id, checked) => {
    const { error } = await supabase.from('shopping_list').update({ is_checked: checked }).eq('id', id);
    if (error) {
      toast.error('Failed to update shopping item.');
      throw error;
    }
    set({
      shoppingList: get().shoppingList.map((i) => (i.id === id ? { ...i, is_checked: checked } : i))
    });
  },

  deleteShoppingItem: async (id) => {
    const { error } = await supabase.from('shopping_list').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete shopping item.');
      throw error;
    }
    set({
      shoppingList: get().shoppingList.filter((i) => i.id !== id)
    });
  },

  clearShoppingList: async (userId) => {
    if (!userId) return;
    const { error } = await supabase.from('shopping_list').delete().eq('user_id', userId);
    if (error) {
      toast.error('Failed to clear shopping list.');
      throw error;
    }
    set({ shoppingList: [] });
  },

  moveItemToPantry: async (item, userId) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('pantry_items')
      .insert({ user_id: userId, item: item.item, category: item.category })
      .select()
      .single();
    if (error) {
      toast.error('Failed to add to pantry.');
      return;
    }
    const { error: deleteError } = await supabase.from('shopping_list').delete().eq('id', item.id);
    if (deleteError) {
      toast.error('Added to pantry, but failed to remove from shopping list.');
      return;
    }
    set({
      shoppingList: get().shoppingList.filter((i) => i.id !== item.id),
      pantryItems: data ? [...get().pantryItems, data as PantryItem] : get().pantryItems
    });
  },

  moveItemToShopping: async (item, userId) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('shopping_list')
      .insert({ user_id: userId, item: item.item, category: item.category, is_checked: false })
      .select()
      .single();
    if (error) {
      toast.error('Failed to move to shopping list.');
      return;
    }
    const { error: deleteError } = await supabase.from('pantry_items').delete().eq('id', item.id);
    if (deleteError) {
      toast.error('Added to shopping list, but failed to remove from pantry.');
      return;
    }
    set({
      pantryItems: get().pantryItems.filter((i) => i.id !== item.id)
    });
    if (data) {
      set({
        shoppingList: [...get().shoppingList, data as ShoppingItem]
      });
    }
  },

  deletePantryItem: async (id) => {
    const { error } = await supabase.from('pantry_items').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete pantry item.');
      throw error;
    }
    set({
      pantryItems: get().pantryItems.filter((i) => i.id !== id)
    });
  },

  addToPantry: async (item, userId, category = null) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('pantry_items')
      .insert({ user_id: userId, item, category })
      .select()
      .single();
    if (error) {
      toast.error('Failed to add to pantry.');
      return;
    }
    if (data) {
      set({
        pantryItems: [...get().pantryItems, data as PantryItem]
      });
    }
  },
}));
