import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import { useRecipes } from '@/hooks/useRecipes';
import { useMealPlans } from '@/hooks/useMealPlans';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useChangelog } from '@/hooks/useChangelog';
import { WhatsNew } from '@/components/WhatsNew';
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
  const changelog = useChangelog();
  const [activeView, setActiveView] = useState<ActiveView>('vault');
  const [publicRecipe, setPublicRecipe] = useState<Recipe | null>(null);
  // A share link that does not resolve must say so. Falling through to the
  // login screen (what happened before) reads as "you need an account", which
  // is exactly the wrong message for a revoked or mistyped link.
  const [publicLinkMissing, setPublicLinkMissing] = useState(false);
  // Read once from the entry URL: it decides whether this render belongs to a
  // guest following a share link, before any fetch has resolved.
  const isPublicSharePath = typeof window !== 'undefined' && window.location.pathname.startsWith('/r/');
  const shareTokenFromPath = isPublicSharePath
    ? decodeURIComponent(window.location.pathname.slice('/r/'.length)).trim()
    : '';

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
    if (path.startsWith('/r/')) {
      // Public share link. Read through the security definer RPC, which is the
      // only thing an anonymous visitor may call: `anon` has no select grant on
      // recipes at all, and the RPC returns a deliberately narrowed column set
      // (no notes, no user_id, no rating). See migration 0056.
      // An empty token needs no round trip; the render path below treats it as
      // a dead link, which keeps this effect free of synchronous setState.
      if (shareTokenFromPath) {
        supabase.rpc('get_shared_recipe', { p_token: shareTokenFromPath }).then(({ data, error }) => {
          const row = Array.isArray(data) ? data[0] : null;
          if (row && !error) {
            setPublicRecipe(row as Recipe);
            setActiveView('public_recipe');
          } else {
            setPublicLinkMissing(true);
          }
        });
      }
    } else if (path.startsWith('/recipe/')) {
      // Owner-facing permalink, kept for existing bookmarks. This one reads the
      // table directly, so it resolves only for someone the RLS policy allows.
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
  }, [shareTokenFromPath, fetchRecipes, fetchMealPlans, fetchShoppingList, fetchPantryItems, fetchSettings, fetchInbox, fetchContacts, fetchCollections]);

  // Scroll to top whenever the active view changes
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [activeView]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  // Debounce search query changes (300ms) before fetching from server.
  // Every value read inside must be listed: activeOwnerId was passed to
  // fetchRecipes but left out of the deps, so picking a person re-rendered the
  // chips without ever refetching and the vault kept showing everyone.
  useEffect(() => {
    // A guest on a share link has no vault to search, and the query would come
    // back empty under RLS anyway — so skip the round trip entirely.
    if (isPublicSharePath) return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchRecipes(searchQuery, activeFilter, activeCollectionId, memberships, sortBy, activeOwnerId);
    }, 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [isPublicSharePath, searchQuery, activeFilter, activeCollectionId, memberships, sortBy, activeOwnerId, fetchRecipes]);

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

  // Returns whether the write landed. Most callers ignore it, but minting a
  // share link must not copy a URL to the clipboard unless the token was
  // actually saved — handing out a dead link is the bug this feature fixes.
  async function handleUpdateRecipe(id: string, changes: Partial<Recipe>): Promise<boolean> {
    try {
      await updateRecipe(id, changes);
    } catch (err) {
      // Surfaced rather than swallowed: the store now rejects a write that RLS
      // refused, and the open drawer must not keep showing the change either.
      toast.error(err instanceof Error ? err.message : 'Could not save that change.');
      return false;
    }
    setSelectedRecipe((prev) => prev?.id === id ? { ...prev, ...changes } : prev);
    return true;
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

  // Everything below renders behind AuthGate. A visitor following a share link
  // has no account, so a share URL must resolve to its own page (or its own
  // error) before we ever reach that gate.
  if (isPublicSharePath) {
    if (publicLinkMissing || !shareTokenFromPath) {
      return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-50 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-3xl font-black">This link isn't available</h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              The recipe may have been unshared by its owner, or the link may be
              incomplete. Ask whoever sent it for a fresh link.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-50">
        <ViewFallback />
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
          onOpenWhatsNew={changelog.open}
          hasUnreadReleases={changelog.hasUnread}
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
            ownerLabel={connectedPeople.find((p) => p.userId === selectedRecipe?.user_id)?.label ?? null}
            linkedPeople={connectedPeople}
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

        <WhatsNew
          isOpen={changelog.isOpen}
          releases={changelog.isOpen && changelog.unread.length > 0 ? changelog.unread : changelog.releases}
          unreadCount={changelog.unread.length}
          onClose={changelog.close}
        />

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
