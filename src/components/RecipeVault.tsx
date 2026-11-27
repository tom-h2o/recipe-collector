import { useEffect, useRef } from 'react';
import { Search, X, FolderOpen, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RecipeCard } from './RecipeCard';
import type { SortOption } from '@/lib/constants';
import { NEW_FROM_IPHONE } from '@/store/recipeStore';
import { chipClass, toggleFilter } from '@/lib/tags';
import { FilterBar } from './FilterBar';
import { CollectionBar } from './CollectionBar';
import { SortButton } from './SortButton';
import { useRecipeStore } from '@/store/recipeStore';
import { useT } from '@/i18n';
import { rich } from '@/i18n/rich';
import type { Recipe, RecipeTranslation, Collection, RecipeCollection, LinkedPerson } from '@/types';

interface Props {
  recipes: Recipe[];
  loading: boolean;
  processingIds: Set<string>;
  searchQuery: string;
  /** Filter chips in use; they combine. */
  activeFilters: string[];
  hasMore: boolean;
  recipeLanguages: Record<string, string>;
  translationsCache: Record<string, RecipeTranslation>;
  translationsLoading: boolean;
  collections: Collection[];
  memberships: RecipeCollection[];
  activeCollectionId: string | null;
  /** Accepted connections, used for the owner chips. */
  linkedPeople?: LinkedPerson[];
  /** Which person's recipes to show, or null for everyone. */
  activeOwnerId?: string | null;
  currentUserId?: string | null;
  onOwnerChange?: (userId: string | null) => void;
  onSearchChange: (q: string) => void;
  onFiltersChange: (next: string[]) => void;
  onCollectionChange: (id: string | null) => void;
  onCreateCollection: (name: string) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onLoadMore: () => void;
  onOpenRecipe: (r: Recipe) => void;
  onToggleFavourite: (r: Recipe, e: React.MouseEvent) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  /** Shown above the search: what the iPhone Shortcut sent (ImportBanner). */
  banner?: React.ReactNode;
  /** Recipes sent from the iPhone Shortcut and not opened yet: New badge and chip. */
  newRecipeIds?: Set<string>;
}

export function RecipeVault({
  recipes, loading, processingIds, searchQuery, activeFilters, hasMore,
  recipeLanguages, translationsCache, translationsLoading,
  collections, memberships, activeCollectionId,
  linkedPeople = [], activeOwnerId = null, currentUserId = null, onOwnerChange,
  sortBy, onSortChange,
  onSearchChange, onFiltersChange, onCollectionChange, onCreateCollection, onDeleteCollection, onRenameCollection,
  onLoadMore, onOpenRecipe, onToggleFavourite,
  banner, newRecipeIds,
}: Props) {
  const t = useT();
  const searchRef = useRef<HTMLInputElement>(null);

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
  const loadError = useRecipeStore((state) => state.loadError);
  // Whether anything narrows the list. An empty answer then means "nothing
  // matches", not "you have no recipes".
  const isNarrowed = !!searchQuery.trim() || activeFilters.length > 0 || !!activeCollectionId || !!activeOwnerId;

  function retryLoad() {
    const s = useRecipeStore.getState();
    void s.fetchRecipes(s.currentSearchQuery, s.currentTagFilter, s.currentCollectionId, s.currentMemberships, s.currentSortBy, s.currentOwnerFilter);
  }

  return (
    <>
      {banner}
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
              placeholder={t('Search recipes, ingredients…')}
              aria-label={t('Search recipes')}
              title={t('Press / to search')}
              // Room on the right only while there is something to clear.
              className={`w-full h-10 pl-10 ${searchQuery ? 'pr-10' : 'pr-3'} rounded-xl border-0 bg-sk-surface-highest dark:bg-input text-sk-on-surface dark:text-foreground text-sm font-sans focus:outline-none focus:ring-2 focus:ring-sk-primary/25 dark:focus:ring-primary/25 transition placeholder:text-sk-outline dark:placeholder:text-muted-foreground`}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                aria-label={t('Clear search')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sk-outline hover:text-sk-primary dark:hover:text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <SortButton value={sortBy} onChange={onSortChange} />
        </div>

        {/* Whose recipes — only worth showing once something is connected */}
        {linkedPeople.length > 0 && onOwnerChange && (
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="w-4 h-4 text-sk-outline dark:text-muted-foreground shrink-0" aria-label={t('Whose recipes')} />
            {[
              { id: null, label: t('Everyone') },
              { id: currentUserId, label: t('Mine') },
              ...linkedPeople.map((p) => ({ id: p.userId, label: p.label })),
            ]
              .filter((c) => c.id !== undefined)
              .map((chip) => (
                <button
                  key={chip.id ?? 'all'}
                  onClick={() => onOwnerChange(chip.id ?? null)}
                  aria-pressed={activeOwnerId === (chip.id ?? null)}
                  className={chipClass(activeOwnerId === (chip.id ?? null))}
                >
                  {chip.label}
                </button>
              ))}
          </div>
        )}

        <CollectionBar
          collections={collections}
          memberships={memberships}
          activeCollectionId={activeCollectionId}
          onChange={onCollectionChange}
          onCreate={onCreateCollection}
          onRename={onRenameCollection}
          onDelete={onDeleteCollection}
        />

        <FilterBar
          active={activeFilters}
          onChange={onFiltersChange}
          showNew={(newRecipeIds?.size ?? 0) > 0 || activeFilters.includes(NEW_FROM_IPHONE)}
          searching={!!searchQuery}
          onClearAll={() => { onSearchChange(''); onFiltersChange([]); }}
        />
      </div>

      {/* Recipe Grid */}
      <main>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7 sm:gap-6 lg:gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="recipe-card animate-pulse rounded-xl overflow-hidden bg-white dark:bg-card">
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
        ) : loadError ? (
          <div role="alert" className="text-center py-24 px-6 bg-white dark:bg-card rounded-3xl shadow-ambient">
            <p className="font-serif text-xl font-normal text-sk-on-surface dark:text-foreground mb-1">{t('The recipes could not be loaded')}</p>
            <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground mb-5">
              {t('Nothing is lost. Check the connection and try again.')}
            </p>
            <button
              type="button"
              onClick={retryLoad}
              className="inline-flex items-center h-10 px-5 rounded-full bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground text-sm font-semibold font-sans transition-colors"
            >
              {t('Try again')}
            </button>
          </div>
        ) : recipes.length === 0 && !isNarrowed ? (
          <div className="text-center py-32 bg-white dark:bg-card rounded-3xl shadow-ambient">
            {/* Empty-vault Speisekammer key */}
            <svg className="w-20 h-20 mx-auto mb-6 text-sk-primary-fixed dark:text-muted" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.5"/>
              <circle cx="11" cy="11" r="3" fill="currentColor" opacity="0.3"/>
              <line x1="16.5" y1="14.5" x2="30" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
              <line x1="23" y1="21.5" x2="26" y2="24.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
              <line x1="26" y1="24.5" x2="29" y2="21.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
            </svg>
            <p className="font-serif text-2xl font-normal text-sk-on-surface dark:text-foreground mb-2">{t('The vault is empty')}</p>
            <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground">
              {rich(t, 'Click <b>Add Recipe</b> or press <kbd>n</kbd> to get started!', {
                b: (s) => <strong>{s}</strong>,
                kbd: (s) => <kbd className="px-1.5 py-0.5 rounded-md bg-sk-surface-highest dark:bg-muted text-xs font-mono text-sk-on-surface-variant">{s}</kbd>,
              })}
            </p>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="text-center py-24 bg-white dark:bg-card rounded-3xl shadow-ambient">
            {activeCollectionId && !searchQuery && activeFilters.length === 0 ? (
              <>
                <FolderOpen className="w-14 h-14 mx-auto mb-4 text-sk-primary-fixed dark:text-muted" />
                <p className="font-serif text-xl font-normal text-sk-on-surface dark:text-foreground mb-1">
                  {(() => {
                    const name = collections.find((c) => c.id === activeCollectionId)?.name;
                    return name ? t('{name} is empty', { name }) : t('This collection is empty');
                  })()}
                </p>
                <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground">
                  {rich(t, 'Open a recipe and use <b>⋯ → Add to collection</b> to populate it.', { b: (s) => <strong>{s}</strong> })}
                </p>
              </>
            ) : (
              <>
                <Search className="w-14 h-14 mx-auto mb-4 text-sk-primary-fixed dark:text-muted" />
                <p className="font-serif text-xl font-normal text-sk-on-surface dark:text-foreground mb-1">{t('No results found')}</p>
                <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground">{t('Try a different search or clear the filters.')}</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7 sm:gap-6 lg:gap-8">
              {filteredRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  isProcessing={processingIds.has(recipe.id)}
                  isNew={newRecipeIds?.has(recipe.id) ?? false}
                  activeFilters={activeFilters}
                  translation={recipeLanguages[recipe.id] ? translationsCache[`${recipe.id}:${recipeLanguages[recipe.id]}`] : null}
                  translationLoading={
                    translationsLoading &&
                    !!recipeLanguages[recipe.id] &&
                    !translationsCache[`${recipe.id}:${recipeLanguages[recipe.id]}`]
                  }
                  onOpen={onOpenRecipe}
                  onToggleFavourite={onToggleFavourite}
                  onFilterChange={(tag) => onFiltersChange(toggleFilter(activeFilters, tag))}
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
                  {t('Load more')}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
