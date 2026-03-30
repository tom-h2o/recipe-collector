import { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import { useRecipes } from '@/hooks/useRecipes';
import { useMealPlans } from '@/hooks/useMealPlans';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';

import { AuthGate } from '@/components/AuthGate';
import { Layout } from '@/components/Layout';
import { RecipeVault } from '@/components/RecipeVault';
import { RecipeDetail } from '@/components/RecipeDetail';
import { CookMode } from '@/components/CookMode';
import { RecipeForm } from '@/components/RecipeForm';
import { MealPlanner } from '@/components/MealPlanner';
import { ShoppingList } from '@/components/ShoppingList';
import { SettingsPanel } from '@/components/SettingsPanel';
import { SuggestModal } from '@/components/SuggestModal';
import { PublicRecipe } from '@/components/PublicRecipe';

import { supabase } from '@/lib/supabase';
import type { ActiveView, Recipe, RecipeTranslation } from '@/types';

export default function App() {
  const { user, signOut } = useAuth();
  const { recipes, loading, processingIds, hasMore, fetchRecipes, loadMore, saveRecipe, deleteRecipe, toggleFavourite, updateRecipe } = useRecipes(user?.id);
  const { mealPlans, fetchMealPlans, addMealPlan, removeMealPlan } = useMealPlans(user?.id);
  const { shoppingList, pantryItems, isGeneratingShopping, fetchShoppingList, fetchPantryItems, generateShoppingList, toggleItem, deleteItem, clearAll, moveItemToPantry, moveItemToShopping, deletePantryItem, addToPantry } = useShoppingList(user?.id);
  const { settings, isSavingSettings, fetchSettings, saveSettings } = useSettings(user?.id);
  const { preferredLanguage, setPreferredLanguage } = useLanguagePreference();
  const [translationsCache, setTranslationsCache] = useState<Record<string, RecipeTranslation>>({});

  function cacheTranslation(recipeId: string, langCode: string, t: RecipeTranslation) {
    setTranslationsCache((prev) => ({ ...prev, [`${recipeId}:${langCode}`]: t }));
  }

  const [activeView, setActiveView] = useState<ActiveView>('vault');
  const [publicRecipe, setPublicRecipe] = useState<Recipe | null>(null);

  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isCookMode, setIsCookMode] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/recipe/')) {
      const id = path.split('/recipe/')[1];
      if (id) {
        supabase.from('recipes').select('*').eq('id', id).single().then(({ data }) => {
          if (data) { setPublicRecipe(data as Recipe); setActiveView('public_recipe'); }
        });
      }
    } else {
      fetchRecipes();
      fetchMealPlans();
      fetchShoppingList();
      fetchPantryItems();
      fetchSettings();
    }
  }, [fetchRecipes, fetchMealPlans, fetchShoppingList, fetchPantryItems, fetchSettings]);

  function openForm(recipe?: Recipe) {
    setEditingRecipe(recipe ?? null);
    setIsFormOpen(true);
  }

  // Keyboard shortcut: 'n' opens new recipe form
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== 'n') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      openForm();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  async function handleUpdateRecipe(id: string, changes: Partial<Recipe>) {
    await updateRecipe(id, changes);
    setSelectedRecipe((prev) => prev?.id === id ? { ...prev, ...changes } : prev);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteRecipe(deleteTarget.id);
      setDeleteTarget(null);
      setSelectedRecipe(null);
    } catch {
      // error toast handled in hook or shown from component
    }
  }

  if (activeView === 'public_recipe' && publicRecipe) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 sm:p-10 font-sans print:p-0 print:bg-white text-zinc-900 dark:text-zinc-50">
        <PublicRecipe recipe={publicRecipe} />
      </div>
    );
  }

  return (
    <AuthGate>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 sm:p-10 font-sans print:p-0 print:bg-white text-zinc-900 dark:text-zinc-50">
        <Toaster richColors position="top-right" className="print:hidden" />

        <Layout
          activeView={activeView}
          user={user}
          recipeCount={recipes.length}
          onSetView={setActiveView}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSuggest={() => setIsSuggestOpen(true)}
          onAddRecipe={() => openForm()}
          onSignOut={signOut}
        >
          {activeView === 'vault' && (
            <RecipeVault
              recipes={recipes}
              loading={loading}
              processingIds={processingIds}
              searchQuery={searchQuery}
              activeFilter={activeFilter}
              hasMore={hasMore}
              preferredLanguage={preferredLanguage}
              translationsCache={translationsCache}
              onSearchChange={setSearchQuery}
              onFilterChange={setActiveFilter}
              onLoadMore={loadMore}
              onOpenRecipe={setSelectedRecipe}
              onToggleFavourite={(r, e) => { e.stopPropagation(); toggleFavourite(r); }}
            />
          )}

          {activeView === 'planner' && (
            <MealPlanner
              recipes={recipes}
              mealPlans={mealPlans}
              onAddMealPlan={addMealPlan}
              onRemoveMealPlan={removeMealPlan}
              onRefreshMealPlans={fetchMealPlans}
              onOpenRecipe={setSelectedRecipe}
            />
          )}

          {activeView === 'shopping' && (
            <ShoppingList
              shoppingList={shoppingList}
              pantryItems={pantryItems}
              isGenerating={isGeneratingShopping}
              mealPlans={mealPlans}
              onGenerate={generateShoppingList}
              onToggleItem={toggleItem}
              onDeleteItem={deleteItem}
              onClearAll={clearAll}
              onMoveItemToPantry={moveItemToPantry}
              onMoveItemToShopping={moveItemToShopping}
              onDeletePantryItem={deletePantryItem}
              onAddToPantry={addToPantry}
            />
          )}
        </Layout>

        <RecipeDetail
          key={selectedRecipe?.id ?? 'none'}
          recipe={selectedRecipe}
          preferredLanguage={preferredLanguage}
          temperatureUnit={settings.temperature_unit}
          onLanguageChange={setPreferredLanguage}
          onTranslationCached={cacheTranslation}
          onClose={() => setSelectedRecipe(null)}
          onEdit={(r) => openForm(r)}
          onDelete={setDeleteTarget}
          onCook={() => setIsCookMode(true)}
          onUpdateRecipe={handleUpdateRecipe}
          onAddMealPlan={addMealPlan}
          onSaveScaled={saveRecipe}
        />

        <CookMode
          recipe={selectedRecipe}
          isOpen={isCookMode}
          onClose={() => setIsCookMode(false)}
        />

        <RecipeForm
          isOpen={isFormOpen}
          editingRecipe={editingRecipe}
          onClose={() => { setIsFormOpen(false); setEditingRecipe(null); }}
          onSave={saveRecipe}
        />

        <SettingsPanel
          isOpen={isSettingsOpen}
          settings={settings}
          isSaving={isSavingSettings}
          onClose={() => setIsSettingsOpen(false)}
          onSave={saveSettings}
        />

        <SuggestModal
          isOpen={isSuggestOpen}
          onClose={() => setIsSuggestOpen(false)}
          onSelectRecipe={setSelectedRecipe}
        />

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Recipe?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>"{deleteTarget?.title}"</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AuthGate>
  );
}
