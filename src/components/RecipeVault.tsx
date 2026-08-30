import { useEffect, useRef, useState } from 'react';
import { Search, X, ArrowUpDown, FolderOpen, Plus, Trash2, Pencil, Check } from 'lucide-react';
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
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onLoadMore: () => void;
  onOpenRecipe: (r: Recipe) => void;
  onToggleFavourite: (r: Recipe, e: React.MouseEvent) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export function RecipeVault({
  recipes, loading, processingIds, searchQuery, activeFilter, hasMore,
  recipeLanguages, translationsCache, translationsLoading,
  collections, memberships, activeCollectionId,
  sortBy, onSortChange,
  onSearchChange, onFilterChange, onCollectionChange, onCreateCollection, onDeleteCollection, onRenameCollection,
  onLoadMore, onOpenRecipe, onToggleFavourite,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  const filteredRecipes = recipes;

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
              aria-label="Sort recipes"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
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
            <div key={c.id} className="inline-flex items-center gap-0.5 group/chip">
              {renamingId === c.id ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!renameValue.trim()) return;
                    await onRenameCollection(c.id, renameValue);
                    setRenamingId(null);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setRenamingId(null); }}
                    onBlur={() => setRenamingId(null)}
                    className="px-2 py-1 rounded-full text-xs border-0 bg-sk-surface-highest dark:bg-input focus:outline-none focus:ring-2 focus:ring-sk-primary/25 text-sk-on-surface dark:text-foreground w-28 font-sans"
                  />
                  <button type="submit" className="p-1 text-sk-primary dark:text-primary">
                    <Check className="w-3 h-3" />
                  </button>
                </form>
              ) : (
                <>
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
                    onClick={() => { setRenamingId(c.id); setRenameValue(c.name); }}
                    className="p-1 text-sk-outline-variant dark:text-muted-foreground/40 hover:text-sk-primary dark:hover:text-primary transition-colors opacity-0 group-hover/chip:opacity-100"
                    title="Rename collection"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDeleteCollection(c.id)}
                    className="p-1 text-sk-outline-variant dark:text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover/chip:opacity-100"
                    title="Delete collection"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
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
              <div key={i} className="animate-pulse rounded-xl overflow-hidden bg-white dark:bg-card" style={{ boxShadow: '0 2px 12px rgba(47,49,46,0.04)' }}>
                <div className="aspect-[4/3] bg-sk-surface-low dark:bg-muted" />
                <div className="px-4 pt-4 pb-3 space-y-3">
                  <div className="h-5 bg-sk-surface-low dark:bg-muted rounded-full w-3/4" />
                  <div className="space-y-1.5">
                    <div className="h-3 bg-sk-surface-low dark:bg-muted rounded-full w-full" />
                    <div className="h-3 bg-sk-surface-low dark:bg-muted rounded-full w-2/3" />
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    {[1, 2, 3].map((j) => <div key={j} className="h-5 w-16 bg-sk-surface-low dark:bg-muted rounded-full" />)}
                  </div>
                </div>
                <div className="h-10 bg-sk-surface-low dark:bg-muted mx-0 rounded-b-xl" />
              </div>
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
            {activeCollectionId && !searchQuery && !activeFilter ? (
              <>
                <FolderOpen className="w-14 h-14 mx-auto mb-4 text-sk-primary-fixed dark:text-muted" />
                <p className="font-serif text-xl font-normal text-sk-on-surface dark:text-foreground mb-1">
                  {collections.find((c) => c.id === activeCollectionId)?.name ?? 'This collection'} is empty
                </p>
                <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground">
                  Open a recipe and use <strong>⋯ → Add to collection</strong> to populate it.
                </p>
              </>
            ) : (
              <>
                <Search className="w-14 h-14 mx-auto mb-4 text-sk-primary-fixed dark:text-muted" />
                <p className="font-serif text-xl font-normal text-sk-on-surface dark:text-foreground mb-1">No results found</p>
                <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground">Try a different search or clear the filters.</p>
              </>
            )}
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
            {hasMore && (
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
