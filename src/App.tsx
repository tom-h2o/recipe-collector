import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { Toaster } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import { useRecipes } from '@/hooks/useRecipes';
import { useMealPlans } from '@/hooks/useMealPlans';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useAccountLinks } from '@/hooks/useAccountLinks';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { useRecipeShares } from '@/hooks/useRecipeShares';
import { useCollections } from '@/hooks/useCollections';

import { AuthGate } from '@/components/AuthGate';
import { Layout } from '@/components/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';

import { supabase } from '@/lib/supabase';
import { useTranslationCache } from '@/hooks/useTranslationCache';
import type { ActiveView, Recipe } from '@/types';
import type { SortOption } from '@/lib/constants';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL ?? '';

const RecipeVault = lazy(() => import('@/components/RecipeVault').then((m) => ({ default: m.RecipeVault })));
const RecipeDetail = lazy(() => import('@/components/RecipeDetail').then((m) => ({ default: m.RecipeDetail })));
const RecipeForm = lazy(() => import('@/components/RecipeForm').then((m) => ({ default: m.RecipeForm })));
const MealPlanner = lazy(() => import('@/components/MealPlanner').then((m) => ({ default: m.MealPlanner })));
const ShoppingList = lazy(() => import('@/components/ShoppingList').then((m) => ({ default: m.ShoppingList })));
const SettingsPanel = lazy(() => import('@/components/SettingsPanel').then((m) => ({ default: m.SettingsPanel })));
const SuggestModal = lazy(() => import('@/components/SuggestModal').then((m) => ({ default: m.SuggestModal })));
const PublicRecipe = lazy(() => import('@/components/PublicRecipe').then((m) => ({ default: m.PublicRecipe })));
const SendRecipeModal = lazy(() => import('@/components/SendRecipeModal').then((m) => ({ default: m.SendRecipeModal })));
const RecipeInbox = lazy(() => import('@/components/RecipeInbox').then((m) => ({ default: m.RecipeInbox })));
const AdminPanel = lazy(() => import('@/components/AdminPanel').then((m) => ({ default: m.AdminPanel })));

function ViewFallback() {
  return <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">Loading...</div>;
}

export default function App() {
  const { user, signOut } = useAuth();
  const { recipes, loading, processingIds, hasMore, fetchRecipes, loadMore, saveRecipe, deleteRecipe, toggleFavourite, updateRecipe } = useRecipes(user?.id);
  const { mealPlans, fetchMealPlans, addMealPlan, removeMealPlan } = useMealPlans(user?.id);
  const { shoppingList, pantryItems, isGeneratingShopping, fetchShoppingList, fetchPantryItems, generateShoppingList, toggleItem, deleteItem, clearAll, moveItemToPantry, moveItemToShopping, deletePantryItem, addToPantry } = useShoppingList(user?.id);
  const { settings, isSavingSettings, fetchSettings, saveSettings } = useSettings(user?.id);
  const {
    connected: connectedPeople, pendingIncoming: linkInvites,
    fetchLinks, accept: acceptLink, disconnect: declineLink,
  } = useAccountLinks(user?.id, user?.email);
  const { inboxShares, inboxCount, contacts, fetchInbox, fetchContacts, sendShare, acceptShare, rejectShare } = useRecipeShares(user?.id, user?.email);
  const { translationsCache, translationsLoading, cacheTranslation } = useTranslationCache(recipes);
  const { collections, memberships, fetchCollections, createCollection, deleteCollection, renameCollection, addToCollection, removeFromCollection } = useCollections(user?.id);

  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);

  // Vault owner chip: null shows everyone visible, otherwise one person

  const [activeOwnerId, setActiveOwnerId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('vault');
  const [publicRecipe, setPublicRecipe] = useState<Recipe | null>(null);

  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<Recipe | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
      fetchRecipes('');
      fetchMealPlans();
      fetchShoppingList();
      fetchPantryItems();
      fetchSettings();
      fetchInbox();
      fetchContacts();
      fetchCollections();
    }
  }, [fetchRecipes, fetchMealPlans, fetchShoppingList, fetchPantryItems, fetchSettings, fetchInbox, fetchContacts, fetchCollections]);

  // Scroll to top whenever the active view changes
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [activeView]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  // Debounce search query changes (300ms) before fetching from server
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchRecipes(searchQuery, activeFilter, activeCollectionId, memberships, sortBy, activeOwnerId);
    }, 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery, activeFilter, activeCollectionId, memberships, sortBy, fetchRecipes]);

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

  async function handleAcceptShare(share: Parameters<typeof acceptShare>[0]) {
    const newRecipeId = await acceptShare(share);
    if (newRecipeId) {
      // Refresh vault so the new recipe appears
      fetchRecipes('');
    }
  }

  if (activeView === 'public_recipe' && publicRecipe) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 sm:p-10 font-sans print:p-0 print:bg-white text-zinc-900 dark:text-zinc-50">
        <Suspense fallback={<ViewFallback />}>
          <PublicRecipe recipe={publicRecipe} />
        </Suspense>
      </div>
    );
  }

  return (
    <AuthGate>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans print:p-0 print:bg-white text-zinc-900 dark:text-zinc-50">
        <Toaster richColors position="top-right" className="print:hidden" />

        <Layout
          activeView={activeView}
          user={user}
          isAdmin={!!ADMIN_EMAIL && user?.email === ADMIN_EMAIL}
          recipeCount={recipes.length}
          inboxCount={inboxCount + linkInvites.length}
          onSetView={setActiveView}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSuggest={() => setIsSuggestOpen(true)}
          onAddRecipe={() => openForm()}
          onSignOut={signOut}
        >
          <Suspense fallback={<ViewFallback />}>
          {activeView === 'vault' && (
            <RecipeVault
              recipes={recipes}
              loading={loading}
              processingIds={processingIds}
              searchQuery={searchQuery}
              activeFilter={activeFilter}
              hasMore={hasMore}
              linkedPeople={connectedPeople}
              activeOwnerId={activeOwnerId}
              currentUserId={user?.id ?? null}
              onOwnerChange={setActiveOwnerId}
              recipeLanguages={Object.fromEntries(recipes.map((r) => [r.id, r.preferred_language ?? '']))}
              translationsCache={translationsCache}
              translationsLoading={translationsLoading}
              collections={collections}
              memberships={memberships}
              activeCollectionId={activeCollectionId}
              sortBy={sortBy}
              onSortChange={setSortBy}
              onSearchChange={setSearchQuery}
              onFilterChange={setActiveFilter}
              onCollectionChange={setActiveCollectionId}
              onCreateCollection={createCollection}
              onDeleteCollection={deleteCollection}
              onRenameCollection={renameCollection}
              onLoadMore={loadMore}
              onOpenRecipe={setSelectedRecipe}
              onToggleFavourite={(r, e) => { e.stopPropagation(); toggleFavourite(r); }}
            />
          )}

          {activeView === 'planner' && (
            <MealPlanner
              recipes={recipes}
              mealPlans={mealPlans}
              translationsCache={translationsCache}
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

          {activeView === 'inbox' && (
            <RecipeInbox
              shares={inboxShares}
              linkInvites={linkInvites}
              onAccept={handleAcceptShare}
              onReject={rejectShare}
              onAcceptLink={async (id) => { await acceptLink(id); fetchRecipes(''); }}
              onDeclineLink={declineLink}
              onBack={() => setActiveView('vault')}
            />
          )}

          {activeView === 'admin' && <AdminPanel />}
          </Suspense>
        </Layout>

        <Suspense fallback={null}>
        {selectedRecipe && (
          <ErrorBoundary key={selectedRecipe.id}>
          <RecipeDetail
            key={selectedRecipe.id}
            recipe={selectedRecipe}
            userId={user?.id}
            preferredLanguage={selectedRecipe.preferred_language ?? null}
            temperatureUnit={settings.temperature_unit}
            translationsCache={translationsCache}
            onLanguageChange={(lang) => { handleUpdateRecipe(selectedRecipe.id, { preferred_language: lang }); }}
            onTranslationCached={cacheTranslation}
            onClose={() => setSelectedRecipe(null)}
            onEdit={(r) => openForm(r)}
            onDelete={setDeleteTarget}
            onSend={(r) => { setSelectedRecipe(null); setSendTarget(r); }}
            onUpdateRecipe={handleUpdateRecipe}
            onAddMealPlan={addMealPlan}
            onSaveScaled={saveRecipe}
            collections={collections}
            recipeCollectionIds={memberships.filter((m) => m.recipe_id === selectedRecipe.id).map((m) => m.collection_id)}
            onAddToCollection={(colId) => addToCollection(colId, selectedRecipe.id)}
            onRemoveFromCollection={(colId) => removeFromCollection(colId, selectedRecipe.id)}
          />
          </ErrorBoundary>
        )}

        {isFormOpen && (
          <RecipeForm
            isOpen={isFormOpen}
            editingRecipe={editingRecipe}
            onClose={() => { setIsFormOpen(false); setEditingRecipe(null); }}
            onSave={saveRecipe}
            userId={user?.id}
          />
        )}

        {isSettingsOpen && (
          <SettingsPanel
            isOpen={isSettingsOpen}
            settings={settings}
            isSaving={isSavingSettings}
            onClose={() => setIsSettingsOpen(false)}
            onSave={saveSettings}
            userEmail={user?.email}
            userId={user?.id}
          />
        )}

        {isSuggestOpen && (
          <SuggestModal
            isOpen={isSuggestOpen}
            onClose={() => setIsSuggestOpen(false)}
            onSelectRecipe={setSelectedRecipe}
          />
        )}

        {sendTarget && (
          <SendRecipeModal
            recipe={sendTarget}
            contacts={contacts}
            isOpen={true}
            onClose={() => setSendTarget(null)}
            onSend={sendShare}
          />
        )}

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
        </Suspense>
      </div>
    </AuthGate>
  );
}
