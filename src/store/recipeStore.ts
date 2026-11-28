/* eslint-disable @typescript-eslint/no-explicit-any */
import { searchWords } from '@/lib/searchWords';
import { create } from 'zustand';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { PAGE_SIZE } from '@/lib/constants';
import { t, tn, translateMessage } from '@/i18n';
import { basketIngredients, upcomingMeals } from '@/lib/shoppingMeals';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Recipe, MealPlan, ShoppingItem, PantryItem } from '@/types';

export type RecipePayload = Omit<Recipe, 'id' | 'created_at' | 'tags' | 'is_favourite' | 'nutrition' | 'rating' | 'notes' | 'user_id'>;

interface RecipeState {
  // Recipes
  recipes: Recipe[];
  loading: boolean;
  /** The last load of the list failed; the vault says so instead of looking empty. */
  loadError: boolean;
  /** Counts list loads, so a slow older answer cannot replace a newer one. */
  fetchSeq: number;
  processingIds: Set<string>;
  page: number;
  hasMore: boolean;
  
  // Cache filters for loadMore
  currentSearchQuery: string;
  currentTagFilter: string | readonly string[] | null;
  currentCollectionId: string | null;
  currentMemberships: any[];
  currentSortBy: string;
  /** Narrows the vault to one linked person, or null for everyone visible. */
  currentOwnerFilter: string | null;
  /**
   * Recipes the iPhone Shortcut saved that the person has not opened yet
   * (useRecipeImports). The NEW_FROM_IPHONE chip filters the vault to these.
   */
  newImportIds: string[];
  setNewImportIds: (ids: string[]) => void;

  // Polling intervals tracker (in-memory, outside React lifecycle)
  pollingIntervals: Map<string, ReturnType<typeof setInterval>>;
  /** Realtime subscriptions waiting for a recipe's AI pass to land. */
  realtimeChannels: Map<string, RealtimeChannel>;

  // Recipes Actions
  fetchRecipes: (
    searchQuery?: string,
    /** Filter chips in use: tags (combined, all must match) and row properties. */
    tagFilter?: string | readonly string[] | null,
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
  /** Portions, or whether the meal goes on the shopping list. False when it could not be saved. */
  updateMealPlan: (id: string, changes: { servings?: number | null; in_shopping?: boolean }) => Promise<boolean>;

  // Shopping / Pantry
  shoppingList: ShoppingItem[];
  pantryItems: PantryItem[];
  isGeneratingShopping: boolean;
  fetchShoppingList: (userId: string | null) => Promise<void>;
  fetchPantryItems: (userId: string | null) => Promise<void>;
  /** Builds the list from the ticked upcoming meals. True when a new list was written. */
  generateShoppingList: (mealPlans: MealPlan[], userId: string | null) => Promise<boolean>;
  /** An item the person types in themselves; "Generate" leaves it alone. */
  addShoppingItem: (item: string, userId: string | null) => Promise<void>;
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
/**
 * Applies a filter chip to a recipes query.
 *
 * Shared by fetchRecipes and loadMore, which ran separate copies of this and
 * so had to be edited in lockstep: a chip added to one but not the other
 * filters the first page and then loads an unfiltered second page.
 *
 * Most chips are tags; the ones that are not are properties of the row.
 * Several can be on at once (one per tag group, chosen in the vault), and
 * they combine: every tag must be on the recipe (`contains`), and every row
 * property must hold.
 */
type RecipeQuery = ReturnType<ReturnType<typeof supabase.from>['select']>;

/**
 * Not a tag: the recipes the iPhone Shortcut saved and nobody has opened yet.
 * Offered by the "new recipes from your iPhone" banner.
 */
export const NEW_FROM_IPHONE = '\ud83c\udd95 New from iPhone';

/** Matches no row: `in` with an empty list is not valid PostgREST. */
const NO_RECIPE = '00000000-0000-0000-0000-000000000000';

function applyTagFilter<T extends RecipeQuery>(query: T, filters: string | readonly string[], newImportIds: string[] = []): T {
  let q = query;
  const tags: string[] = [];
  for (const filter of typeof filters === 'string' ? [filters] : filters) {
    if (filter === NEW_FROM_IPHONE) q = q.in('id', newImportIds.length ? newImportIds : [NO_RECIPE]) as T;
    else if (filter === '\u2b50 Favourites') q = q.eq('is_favourite', true) as T;
    else if (filter === '\ud83d\udd17 Shared') q = q.not('public_share_token', 'is', null) as T;
    else tags.push(filter);
  }
  return (tags.length ? q.contains('tags', tags) : q) as T;
}

/**
 * The search field, applied in one place for the first page and the next
 * (like the filters above). Each typed word must appear somewhere in the
 * recipe's `search_text`; see src/lib/searchWords.ts and migration 0076.
 */
function applySearch<T extends RecipeQuery>(query: T, input: string): T {
  let q = query;
  for (const word of searchWords(input)) q = q.ilike('search_text', `%${word}%`) as T;
  return q;
}

/** Whether any filter chip is in use. */
function hasFilters(filters: string | readonly string[] | null | undefined): filters is string | readonly string[] {
  return typeof filters === 'string' ? filters.length > 0 : !!filters && filters.length > 0;
}

/**
 * Originals the signed-in person has adopted a copy of, to leave out of the
 * list beside their copy. Only their own copies count: RLS also returns a
 * linked account's recipes, and without the owner filter a partner who
 * adopted one of *your* recipes made your original vanish from your own vault.
 */
async function getAdoptedOriginalIds(): Promise<string[]> {
  try {
    // From the stored session: no request, and no user means nothing adopted.
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return [];
    const { data } = await supabase
      .from('recipes')
      .select('copied_from_recipe_id')
      .eq('user_id', userId)
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
  loadError: false,
  fetchSeq: 0,
  processingIds: new Set<string>(),
  page: 0,
  hasMore: false,
  currentSearchQuery: '',
  currentTagFilter: null,
  currentCollectionId: null,
  currentMemberships: [],
  currentSortBy: 'newest',
  currentOwnerFilter: null,
  newImportIds: [],
  setNewImportIds: (ids) => set({ newImportIds: ids }),
  pollingIntervals: new Map(),
  realtimeChannels: new Map(),

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
    const seq = get().fetchSeq + 1;
    set({
      fetchSeq: seq,
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

    query = applySearch(query, searchQuery);

    if (hasFilters(tagFilter)) {
      query = applyTagFilter(query, tagFilter, get().newImportIds);
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

    const { data, error } = await query.range(0, PAGE_SIZE - 1);
    // A newer search or filter was started while this one was on its way: its
    // answer is the one to show, whichever arrives last.
    if (get().fetchSeq !== seq) return;
    if (data) {
      set({
        recipes: data as Recipe[],
        hasMore: data.length === PAGE_SIZE,
        loadError: false,
      });
    } else {
      // Say so. The list used to keep whatever it showed before, so a search
      // the database refused looked like a search that found the old result.
      console.warn('Loading recipes failed:', error?.message);
      // The recipes already loaded are kept (the planner and the open recipe
      // read them); the vault shows the failure in place of the list.
      set({ loadError: true });
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

    query = applySearch(query, currentSearchQuery);
    if (hasFilters(currentTagFilter)) {
      query = applyTagFilter(query, currentTagFilter, get().newImportIds);
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

    /** Tags and nutrition both present is what "the AI pass finished" means. */
    const isDone = (row: Partial<Recipe> | null | undefined) =>
      !!row && Array.isArray(row.tags) && row.tags.length > 0 && row.nutrition != null;

    /** Tears down both channels and clears the spinner. Safe to call twice. */
    const finish = (row: Partial<Recipe> | null, timedOut: boolean) => {
      if (!get().pollingIntervals.has(recipeId) && !get().realtimeChannels.has(recipeId)) return;

      const intervals = new Map(get().pollingIntervals);
      const handle = intervals.get(recipeId);
      if (handle) clearInterval(handle);
      intervals.delete(recipeId);

      const channels = new Map(get().realtimeChannels);
      const channel = channels.get(recipeId);
      if (channel) {
        channels.delete(recipeId);
        try { supabase.removeChannel(channel); } catch { /* already gone */ }
      }

      const nextProcessingIds = new Set(get().processingIds);
      nextProcessingIds.delete(recipeId);

      set({ pollingIntervals: intervals, realtimeChannels: channels, processingIds: nextProcessingIds });

      if (timedOut) {
        toast.warning(t('Auto-tagging took too long — you can edit tags manually.'), { duration: 5000 });
      }
      if (row) {
        set({ recipes: get().recipes.map((r) => (r.id === recipeId ? { ...r, ...row } : r)) });
      }
    };

    // Realtime is the fast path: the row arrives the moment the AI pass writes
    // it, rather than up to one poll interval later.
    //
    // It is deliberately NOT the only path. postgres_changes fires only for
    // tables in the supabase_realtime publication (migration 0059), and a
    // subscription to an unpublished table connects, reports SUBSCRIBED, and
    // then stays silent — indistinguishable from "still processing" until the
    // timeout. The poll below is the net under that, and under a dropped
    // socket, a blocked websocket, or an event lost in transit. Dropping it
    // would trade a 2s delay for a 30s hang.
    try {
      const channel = supabase
        .channel(`recipe-processing:${recipeId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'recipes', filter: `id=eq.${recipeId}` },
          (payload: { new?: Partial<Recipe> }) => {
            const row = payload?.new;
            if (isDone(row)) finish(row ?? null, false);
          },
        )
        .subscribe();

      const channels = new Map(get().realtimeChannels);
      channels.set(recipeId, channel);
      set({ realtimeChannels: channels });
    } catch {
      // No Realtime in this environment, or a client without it. The poll
      // still covers us, so this is not worth surfacing to the cook.
    }

    // The net. Slower than it was (2s -> 5s) because it is no longer the
    // primary signal: six requests across the 30s budget instead of fifteen.
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('recipes')
        .select('id, tags, nutrition')
        .eq('id', recipeId)
        .single();

      const done = isDone(data);
      const timedOut = Date.now() - started > 30000;

      if (done || timedOut) finish(data ?? null, timedOut && !done);
    }, 5000);

    const currentIntervals = new Map(get().pollingIntervals);
    currentIntervals.set(recipeId, interval);
    set({ pollingIntervals: currentIntervals });
  },

  stopAllPolling: () => {
    const { pollingIntervals, realtimeChannels } = get();
    pollingIntervals.forEach((interval) => clearInterval(interval));
    realtimeChannels.forEach((channel) => {
      try { supabase.removeChannel(channel); } catch { /* already gone */ }
    });
    set({
      pollingIntervals: new Map(),
      realtimeChannels: new Map(),
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
      throw new Error(t('That recipe belongs to someone else, so the change was not saved.'));
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

  updateMealPlan: async (id, changes) => {
    const before = get().mealPlans;
    set({ mealPlans: before.map((m) => (m.id === id ? { ...m, ...changes } : m)) });
    // The affected row is asked for back: an update RLS refuses (a linked
    // account's plan entry) matches no row and reports no error.
    const { data, error } = await supabase.from('meal_plan').update(changes).eq('id', id).select('id');
    if (error || !data?.length) {
      set({ mealPlans: before });
      toast.error(t('The change to the plan could not be saved.'));
      return false;
    }
    return true;
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
    // The meals shown as the basket on the shopping page: today through the
    // next seven days, those still ticked, each at its own portions
    // (src/lib/shoppingMeals.ts). What is shown there is what is sent here.
    const upcoming = upcomingMeals(mealPlans);
    const rawIngredients = basketIngredients(upcoming);
    if (upcoming.length === 0) {
      toast.error(t('No meals planned for the next 7 days!'));
      return false;
    }
    if (rawIngredients.length === 0) {
      toast.error(t('No meal is ticked for the list.'));
      return false;
    }
    set({ isGeneratingShopping: true });
    const toastId = toast.loading(t('Building your shopping list with AI...'));
    try {
      const res = await apiFetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: rawIngredients }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Only what an earlier Generate made (migration 0077). Items the person
      // added themselves stay; this used to delete the whole list.
      const { error: deleteError } = await supabase
        .from('shopping_list')
        .delete()
        .eq('user_id', userId)
        .eq('from_plan', true);
      if (deleteError) throw deleteError;

      const inserts = (data.list as { category: string; items: string[] }[]).flatMap((group) =>
        group.items.map((item) => ({
          category: group.category,
          item,
          is_checked: false,
          from_plan: true,
          ...(userId ? { user_id: userId } : {}),
        })),
      );
      if (inserts.length > 0) {
        const { error: insertError } = await supabase.from('shopping_list').insert(inserts);
        if (insertError) throw insertError;
      }

      await get().fetchShoppingList(userId);
      const kept = get().shoppingList.filter((i) => !i.from_plan).length;
      toast.success(
        kept > 0
          ? tn(kept, 'Shopping list generated. Your own item was kept.', 'Shopping list generated. Your own {n} items were kept.')
          : t('Shopping list generated!'),
        { id: toastId },
      );
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? translateMessage(err.message) : t('Failed to generate list');
      toast.error(message, { id: toastId });
      return false;
    } finally {
      set({ isGeneratingShopping: false });
    }
  },

  addShoppingItem: async (item, userId) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('shopping_list')
      .insert({ user_id: userId, item, category: null, is_checked: false, from_plan: false })
      .select()
      .single();
    if (error) {
      toast.error(t('Failed to add the item.'));
      return;
    }
    if (data) set({ shoppingList: [...get().shoppingList, data as ShoppingItem] });
  },

  toggleShoppingItem: async (id, checked) => {
    const { error } = await supabase.from('shopping_list').update({ is_checked: checked }).eq('id', id);
    if (error) {
      toast.error(t('Failed to update shopping item.'));
      throw error;
    }
    set({
      shoppingList: get().shoppingList.map((i) => (i.id === id ? { ...i, is_checked: checked } : i))
    });
  },

  deleteShoppingItem: async (id) => {
    const { error } = await supabase.from('shopping_list').delete().eq('id', id);
    if (error) {
      toast.error(t('Failed to delete shopping item.'));
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
      toast.error(t('Failed to clear shopping list.'));
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
      toast.error(t('Failed to add to pantry.'));
      return;
    }
    const { error: deleteError } = await supabase.from('shopping_list').delete().eq('id', item.id);
    if (deleteError) {
      toast.error(t('Added to pantry, but failed to remove from shopping list.'));
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
      toast.error(t('Failed to move to shopping list.'));
      return;
    }
    const { error: deleteError } = await supabase.from('pantry_items').delete().eq('id', item.id);
    if (deleteError) {
      toast.error(t('Added to shopping list, but failed to remove from pantry.'));
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
      toast.error(t('Failed to delete pantry item.'));
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
      toast.error(t('Failed to add to pantry.'));
      return;
    }
    if (data) {
      set({
        pantryItems: [...get().pantryItems, data as PantryItem]
      });
    }
  },
}));
