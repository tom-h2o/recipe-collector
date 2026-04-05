import { useMemo, useEffect, useRef, useState } from 'react';
import { Search, X, ArrowUpDown, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RecipeCard } from './RecipeCard';
import { FILTERS, SORT_OPTIONS, type SortOption } from '@/lib/constants';
import type { Recipe, RecipeTranslation, Collection, RecipeCollection } from '@/types';

interface Props {
  recipes: Recipe[];
  loading: boolean;
  processingIds: Set<string>;
  searchQuery: string;
  activeFilter: string | null;
  hasMore: boolean;
  recipeLanguages: Record<string, string>;
  translationsCache: Record<string, RecipeTranslation>;
  translationsLoading: boolean;
  collections: Collection[];
  memberships: RecipeCollection[];
  activeCollectionId: string | null;
  onSearchChange: (q: string) => void;
  onFilterChange: (tag: string | null) => void;
  onCollectionChange: (id: string | null) => void;
  onCreateCollection: (name: string) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onLoadMore: () => void;
  onOpenRecipe: (r: Recipe) => void;
  onToggleFavourite: (r: Recipe, e: React.MouseEvent) => void;
}

export function RecipeVault({
  recipes, loading, processingIds, searchQuery, activeFilter, hasMore,
  recipeLanguages, translationsCache, translationsLoading,
  collections, memberships, activeCollectionId,
  onSearchChange, onFilterChange, onCollectionChange, onCreateCollection, onDeleteCollection,
  onLoadMore, onOpenRecipe, onToggleFavourite,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

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

    if (activeCollectionId) {
      const ids = new Set(memberships.filter((m) => m.collection_id === activeCollectionId).map((m) => m.recipe_id));
      result = result.filter((r) => ids.has(r.id));
    }

    if (activeFilter === '⭐ Favourites') {
      result = result.filter((r) => r.is_favourite);
    } else if (activeFilter) {
      result = result.filter((r) => r.tags?.includes(activeFilter));
    }

    result = [...result];
    switch (sortBy) {
      case 'oldest': result.sort((a, b) => a.created_at.localeCompare(b.created_at)); break;
      case 'a-z': result.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'z-a': result.sort((a, b) => b.title.localeCompare(a.title)); break;
      case 'rating': result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)); break;
      case 'favourites': result.sort((a, b) => Number(b.is_favourite) - Number(a.is_favourite)); break;
    }

    return result;
  }, [recipes, activeFilter, sortBy, activeCollectionId, memberships]);

  return (
    <>
      {/* Search, Sort & Filter */}
      <div className="space-y-3">
        <div className="flex gap-2">
          {/* Search bar — minimalist, no bottom line, surface-highest bg */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-sk-outline dark:text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search recipes, ingredients… (press / to focus)"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border-0 bg-sk-surface-highest dark:bg-input text-sk-on-surface dark:text-foreground text-sm font-sans focus:outline-none focus:ring-2 focus:ring-sk-primary/25 dark:focus:ring-primary/25 transition placeholder:text-sk-outline dark:placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sk-outline hover:text-sk-primary dark:hover:text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Sort selector */}
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sk-outline dark:text-muted-foreground pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="pl-8 pr-3 py-2.5 rounded-xl border-0 bg-sk-surface-highest dark:bg-input text-sk-on-surface-variant dark:text-muted-foreground text-sm font-sans focus:outline-none focus:ring-2 focus:ring-sk-primary/25 dark:focus:ring-primary/25 transition appearance-none cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Collections */}
        <div className="flex items-center gap-2 flex-wrap">
          <FolderOpen className="w-3.5 h-3.5 text-sk-outline dark:text-muted-foreground shrink-0" />
          {collections.map((c) => (
            <div key={c.id} className="inline-flex items-center gap-0.5">
              <button
                onClick={() => onCollectionChange(activeCollectionId === c.id ? null : c.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold font-sans transition-all ${
                  activeCollectionId === c.id
                    ? 'bg-sk-primary text-white dark:bg-primary dark:text-primary-foreground shadow-ambient'
                    : 'bg-sk-surface-highest dark:bg-muted text-sk-on-surface-variant dark:text-muted-foreground hover:text-sk-primary dark:hover:text-primary hover:bg-sk-primary-fixed/30'
                }`}
              >
                {c.name}
                <span className="text-[10px] opacity-60 font-normal">
                  {memberships.filter((m) => m.collection_id === c.id).length}
                </span>
              </button>
              <button
                onClick={() => onDeleteCollection(c.id)}
                className="p-1 text-sk-outline-variant dark:text-muted-foreground/50 hover:text-destructive transition-colors"
                title="Delete collection"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {isCreating ? (
            <form
              onSubmit={async (e) => { e.preventDefault(); if (!newCollectionName.trim()) return; await onCreateCollection(newCollectionName); setNewCollectionName(''); setIsCreating(false); }}
              className="flex items-center gap-1"
            >
              <input
                autoFocus
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setIsCreating(false); setNewCollectionName(''); } }}
                placeholder="Collection name"
                className="px-2 py-1 rounded-full text-xs border-0 bg-sk-surface-highest dark:bg-input focus:outline-none focus:ring-2 focus:ring-sk-primary/25 text-sk-on-surface dark:text-foreground w-32 font-sans"
              />
              <button type="submit" className="text-xs font-semibold text-sk-primary dark:text-primary hover:text-sk-primary-container px-1 font-sans">Save</button>
              <button type="button" onClick={() => { setIsCreating(false); setNewCollectionName(''); }} className="text-xs text-sk-outline hover:text-sk-on-surface-variant px-1 font-sans">Cancel</button>
            </form>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold font-sans border border-dashed border-sk-outline-variant dark:border-border text-sk-outline dark:text-muted-foreground hover:border-sk-primary hover:text-sk-primary dark:hover:text-primary transition-all"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(activeFilter === f ? null : f)}
              className={`px-3 py-1 rounded-full text-xs font-semibold font-sans transition-all ${
                activeFilter === f
                  ? 'bg-sk-primary text-white dark:bg-primary dark:text-primary-foreground shadow-ambient'
                  : 'bg-sk-surface-highest dark:bg-muted text-sk-on-surface-variant dark:text-muted-foreground hover:text-sk-primary dark:hover:text-primary hover:bg-sk-primary-fixed/30'
              }`}
            >
              {f}
            </button>
          ))}
          {(searchQuery || activeFilter) && (
            <button
              onClick={() => { onSearchChange(''); onFilterChange(null); }}
              className="px-3 py-1 rounded-full text-xs font-semibold font-sans border border-dashed border-sk-outline-variant dark:border-border text-sk-outline dark:text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      </div>

      {/* Recipe Grid */}
      <main>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-[400px] bg-sk-surface-low dark:bg-muted rounded-xl" />
            ))}
          </div>
        ) : recipes.length === 0 ? (
          <div className="text-center py-32 bg-white dark:bg-card rounded-3xl shadow-ambient">
            {/* Empty-vault Speisekammer key */}
            <svg className="w-20 h-20 mx-auto mb-6 text-sk-primary-fixed dark:text-muted" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.5"/>
              <circle cx="11" cy="11" r="3" fill="currentColor" opacity="0.3"/>
              <line x1="16.5" y1="14.5" x2="30" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
              <line x1="23" y1="21.5" x2="26" y2="24.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
              <line x1="26" y1="24.5" x2="29" y2="21.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
            </svg>
            <p className="font-serif text-2xl font-normal text-sk-on-surface dark:text-foreground mb-2">The vault is empty</p>
            <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground">
              Click <strong>Add Recipe</strong> or press{' '}
              <kbd className="px-1.5 py-0.5 rounded-md bg-sk-surface-highest dark:bg-muted text-xs font-mono text-sk-on-surface-variant">n</kbd>{' '}
              to get started!
            </p>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="text-center py-24 bg-white dark:bg-card rounded-3xl shadow-ambient">
            <Search className="w-14 h-14 mx-auto mb-4 text-sk-primary-fixed dark:text-muted" />
            <p className="font-serif text-xl font-normal text-sk-on-surface dark:text-foreground mb-1">No results found</p>
            <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground">Try a different search or clear the filters.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
              {filteredRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  isProcessing={processingIds.has(recipe.id)}
                  activeFilter={activeFilter}
                  translation={recipeLanguages[recipe.id] ? translationsCache[`${recipe.id}:${recipeLanguages[recipe.id]}`] : null}
                  translationLoading={
                    translationsLoading &&
                    !!recipeLanguages[recipe.id] &&
                    !translationsCache[`${recipe.id}:${recipeLanguages[recipe.id]}`]
                  }
                  onOpen={onOpenRecipe}
                  onToggleFavourite={onToggleFavourite}
                  onFilterChange={(tag) => onFilterChange(activeFilter === tag ? null : tag)}
                />
              ))}
            </div>
            {hasMore && !searchQuery && !activeFilter && !activeCollectionId && (
              <div className="flex justify-center mt-10">
                <Button
                  onClick={onLoadMore}
                  variant="outline"
                  className="px-8 rounded-full font-semibold font-sans border-sk-outline-variant dark:border-border text-sk-on-surface-variant dark:text-muted-foreground hover:text-sk-primary hover:border-sk-primary dark:hover:text-primary dark:hover:border-primary"
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
