import { useMemo, useEffect, useRef, useState } from 'react';
import { Search, X, ChefHat, ArrowUpDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RecipeCard } from './RecipeCard';
import { parseIngredients } from '@/lib/recipeUtils';
import { FILTERS, SORT_OPTIONS, type SortOption } from '@/lib/constants';
import type { Recipe, RecipeTranslation } from '@/types';

interface Props {
  recipes: Recipe[];
  loading: boolean;
  processingIds: Set<string>;
  searchQuery: string;
  activeFilter: string | null;
  hasMore: boolean;
  preferredLanguage: string | null;
  translationsCache: Record<string, RecipeTranslation>;
  onSearchChange: (q: string) => void;
  onFilterChange: (tag: string | null) => void;
  onLoadMore: () => void;
  onOpenRecipe: (r: Recipe) => void;
  onToggleFavourite: (r: Recipe, e: React.MouseEvent) => void;
}

export function RecipeVault({
  recipes, loading, processingIds, searchQuery, activeFilter, hasMore,
  preferredLanguage, translationsCache,
  onSearchChange, onFilterChange, onLoadMore, onOpenRecipe, onToggleFavourite,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // '/' keyboard shortcut focuses search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== '/') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const filteredRecipes = useMemo(() => {
    let result = recipes;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.title?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          parseIngredients(r.ingredients).some((i) => i.name.toLowerCase().includes(q)),
      );
    }
    if (activeFilter === '⭐ Favourites') {
      result = result.filter((r) => r.is_favourite);
    } else if (activeFilter) {
      result = result.filter((r) => r.tags?.includes(activeFilter));
    }

    // sort
    result = [...result];
    switch (sortBy) {
      case 'oldest': result.sort((a, b) => a.created_at.localeCompare(b.created_at)); break;
      case 'a-z': result.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'z-a': result.sort((a, b) => b.title.localeCompare(a.title)); break;
      case 'rating': result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)); break;
      case 'favourites': result.sort((a, b) => Number(b.is_favourite) - Number(a.is_favourite)); break;
      // 'newest' is already the default order from the server
    }

    return result;
  }, [recipes, searchQuery, activeFilter, sortBy]);

  return (
    <>
      {/* Search, Sort & Filter */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search recipes, ingredients… (press / to focus)"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/60 transition shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="pl-8 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/60 transition shadow-sm appearance-none cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(activeFilter === f ? null : f)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                activeFilter === f
                  ? 'bg-orange-500 border-orange-500 text-white shadow'
                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-600'
              }`}
            >
              {f}
            </button>
          ))}
          {(searchQuery || activeFilter) && (
            <button
              onClick={() => { onSearchChange(''); onFilterChange(null); }}
              className="px-3 py-1 rounded-full text-xs font-semibold border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:text-red-500 hover:border-red-400 transition-all flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      </div>

      {/* Recipe Grid */}
      <main>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse h-[400px] bg-zinc-200 dark:bg-zinc-800 rounded-xl border-none" />
            ))}
          </div>
        ) : recipes.length === 0 ? (
          <div className="text-center py-32 bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800">
            <ChefHat className="w-20 h-20 mx-auto mb-6 text-zinc-300 dark:text-zinc-700" />
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">No recipes yet</p>
            <p className="text-zinc-500 dark:text-zinc-400">Click "Add Recipe" or press <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono">n</kbd> to get started!</p>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="text-center py-24 bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800">
            <Search className="w-16 h-16 mx-auto mb-4 text-zinc-300 dark:text-zinc-700" />
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">No results found</p>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">Try a different search or clear the filters.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  isProcessing={processingIds.has(recipe.id)}
                  activeFilter={activeFilter}
                  translation={preferredLanguage ? translationsCache[`${recipe.id}:${preferredLanguage}`] : null}
                  onOpen={onOpenRecipe}
                  onToggleFavourite={onToggleFavourite}
                  onFilterChange={(tag) => onFilterChange(activeFilter === tag ? null : tag)}
                />
              ))}
            </div>
            {hasMore && !searchQuery && !activeFilter && (
              <div className="flex justify-center mt-10">
                <Button
                  onClick={onLoadMore}
                  variant="outline"
                  className="px-8 rounded-full font-semibold border-zinc-300 dark:border-zinc-700"
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
