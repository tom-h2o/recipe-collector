import { useState, useEffect, useCallback } from 'react';
import { Users, BookOpen, Sparkles, Trash2, RefreshCw, Calendar, TrendingUp, Star, ChevronLeft, ChevronRight, X, Loader2, LayoutDashboard, Activity, BarChart3, Search, UserRound, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { AdminRecipeView } from '@/components/AdminRecipeView';
import { RecipeForm } from '@/components/RecipeForm';
import type { AdminUser, AdminStats, AdminLog, AdminRecipe, Recipe } from '@/types';
import { ReasoningTag } from '@/components/ReasoningTag';
import { SystemCheck } from '@/components/SystemCheck';
import { AdminUsage } from '@/components/AdminUsage';
import { AdminFeedback } from '@/components/AdminFeedback';
import { SegmentedTabs, type SegmentedTab } from '@/components/SegmentedTabs';
import { chipClass, tagClass, tagLabel } from '@/lib/tags';
import { t, useT, translateMessage, dateLocale } from '@/i18n';
import { rich } from '@/i18n/rich';

type Tab = 'overview' | 'usage' | 'feedback' | 'users' | 'recipes' | 'logs' | 'system';

const PAGE_SIZE = 25;

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error ? translateMessage(String(body.error)) : t('Request failed ({status})', { status: res.status });
  } catch {
    return t('Request failed ({status})', { status: res.status });
  }
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-sk-surface-low dark:bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-sk-primary dark:text-primary" />
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
    </div>
  );
}

function Pager({ page, setPage, pageSize, total }: { page: number; setPage: (fn: (p: number) => number) => void; pageSize: number; total: number }) {
  const t = useT();
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
      <span>{t('{from}–{to} of {total}', { from: page * pageSize + 1, to: Math.min((page + 1) * pageSize, total), total })}</span>
      <div className="flex gap-1">
        <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

export function AdminPanel() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('overview');
  // Bumped by Refresh, so the Usage tab (which loads its own data) reloads too.
  const [usageReload, setUsageReload] = useState(0);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const [recipes, setRecipes] = useState<AdminRecipe[]>([]);
  const [recipesTotal, setRecipesTotal] = useState(0);
  const [recipesPage, setRecipesPage] = useState(0);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeSearchDebounced, setRecipeSearchDebounced] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<{ id: string; email: string } | null>(null);

  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);

  // Recipe viewer/editor — `recipe` stays null while the full row is fetched
  const [viewingRecipe, setViewingRecipe] = useState<
    { id: string; title: string; imageUrl: string | null; ownerEmail: string | null; recipe: Recipe | null } | null
  >(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [rerunning, setRerunning] = useState<'tag' | 'nutrition' | null>(null);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await apiFetch('/api/account?tab=overview');
      if (!res.ok) throw new Error(await readError(res));
      const json = await res.json();
      setStats(json.stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('Failed to load admin stats');
      setStatsError(message);
      toast.error(message);
    } finally {
      setStatsLoading(false);
    }
  }, [t]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const loadUsers = useCallback(async (page: number) => {
    setUsersLoading(true);
    try {
      const res = await apiFetch(`/api/account?tab=users&page=${page}&pageSize=${PAGE_SIZE}`);
      if (!res.ok) throw new Error(await readError(res));
      const json = await res.json();
      setUsers(json.users);
      setUsersTotal(json.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Failed to load users'));
    } finally {
      setUsersLoading(false);
    }
  }, [t]);

  useEffect(() => { if (tab === 'users') loadUsers(usersPage); }, [tab, usersPage, loadUsers]);

  const loadRecipes = useCallback(async (page: number, search: string, owner: string | null) => {
    setRecipesLoading(true);
    try {
      const params = new URLSearchParams({ tab: 'recipes', page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (owner) params.set('userId', owner);
      const res = await apiFetch(`/api/account?${params.toString()}`);
      if (!res.ok) throw new Error(await readError(res));
      const json = await res.json();
      setRecipes(json.recipes);
      setRecipesTotal(json.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Failed to load recipes'));
    } finally {
      setRecipesLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(() => setRecipeSearchDebounced(recipeSearch), 300);
    return () => clearTimeout(timer);
  }, [recipeSearch]);

  useEffect(() => { setRecipesPage(0); }, [recipeSearchDebounced, ownerFilter]);

  useEffect(() => {
    if (tab === 'recipes') loadRecipes(recipesPage, recipeSearchDebounced, ownerFilter?.id ?? null);
  }, [tab, recipesPage, recipeSearchDebounced, ownerFilter, loadRecipes]);

  const loadLogs = useCallback(async (page: number) => {
    setLogsLoading(true);
    try {
      const res = await apiFetch(`/api/account?tab=logs&page=${page}&pageSize=${PAGE_SIZE}`);
      if (!res.ok) throw new Error(await readError(res));
      const json = await res.json();
      setLogs(json.logs);
      setLogsTotal(json.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Failed to load logs'));
    } finally {
      setLogsLoading(false);
    }
  }, [t]);

  useEffect(() => { if (tab === 'logs') loadLogs(logsPage); }, [tab, logsPage, loadLogs]);

  function refresh() {
    loadStats();
    if (tab === 'usage' || tab === 'feedback') setUsageReload((n) => n + 1);
    if (tab === 'users') loadUsers(usersPage);
    if (tab === 'recipes') loadRecipes(recipesPage, recipeSearchDebounced, ownerFilter?.id ?? null);
    if (tab === 'logs') loadLogs(logsPage);
  }

  function viewUserRecipes(user: AdminUser) {
    setOwnerFilter({ id: user.id, email: user.email });
    setTab('recipes');
  }

  async function handleDeleteUser(user: AdminUser) {
    setDeletingId(user.id);
    try {
      const res = await apiFetch(`/api/account?userId=${user.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res));
      toast.success(t('Deleted {email}', { email: user.email }));
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setUsersTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Failed to delete user'));
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  }

  /** Writes a refreshed recipe into both the viewer and the paginated list. */
  function applyRecipeUpdate(updated: Recipe) {
    setViewingRecipe((prev) => (prev && prev.id === updated.id ? { ...prev, recipe: updated } : prev));
    setRecipes((prev) =>
      prev.map((r) =>
        r.id === updated.id
          ? { ...r, title: updated.title, description: updated.description, image_url: updated.image_url, tags: updated.tags, servings: updated.servings, prep_time_mins: updated.prep_time_mins, cook_time_mins: updated.cook_time_mins }
          : r,
      ),
    );
  }

  async function openRecipe(r: AdminRecipe) {
    setViewingRecipe({ id: r.id, title: r.title, imageUrl: r.image_url ?? null, ownerEmail: r.user_email, recipe: null });
    try {
      const res = await apiFetch(`/api/account?recipeId=${r.id}`);
      if (!res.ok) throw new Error(await readError(res));
      const body = await res.json();
      setViewingRecipe((prev) =>
        prev && prev.id === r.id
          ? { ...prev, recipe: body.recipe, ownerEmail: body.user_email ?? prev.ownerEmail }
          : prev,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Failed to load recipe'));
      setViewingRecipe(null);
    }
  }

  async function handleAdminSave(payload: Partial<Recipe>, recipeId?: string): Promise<string | undefined> {
    if (!recipeId) return undefined;
    const res = await apiFetch(`/api/account?recipeId=${recipeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await readError(res));
    const body = await res.json();
    applyRecipeUpdate(body.recipe);
    setEditingRecipe(null);
    return recipeId;
  }

  /** Re-runs the tag or nutrition endpoint; both write straight to the recipe row. */
  async function rerun(kind: 'tag' | 'nutrition') {
    const recipe = viewingRecipe?.recipe;
    if (!recipe) return;
    setRerunning(kind);
    const id = toast.loading(kind === 'tag' ? t('Regenerating tags…') : t('Regenerating nutrition…'));
    try {
      const payload =
        kind === 'tag'
          ? { recipeId: recipe.id, title: recipe.title, description: recipe.description ?? '', ingredients: recipe.ingredients, instructions: recipe.instructions }
          : { recipeId: recipe.id, title: recipe.title, ingredients: recipe.ingredients, servings: recipe.servings ?? undefined };

      const res = await apiFetch(`/api/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = await res.json();

      applyRecipeUpdate(
        kind === 'tag' ? { ...recipe, tags: body.tags } : { ...recipe, nutrition: body.nutrition },
      );
      toast.success(kind === 'tag' ? t('Tags regenerated') : t('Nutrition regenerated'), { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : kind === 'tag' ? t('Failed to re-run tag') : t('Failed to re-run nutrition'), { id });
    } finally {
      setRerunning(null);
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString(dateLocale('en-GB'), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-sk-on-surface-variant dark:text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> {t('Loading admin data…')}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-4 py-16 text-center">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">{t('Admin data unavailable')}</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
          {statsError ?? t('The dashboard could not be loaded.')}
        </p>
        <Button variant="outline" size="sm" onClick={loadStats} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> {t('Retry')}
        </Button>
      </div>
    );
  }

  const TABS: SegmentedTab<Tab>[] = [
    { id: 'overview', label: t('Overview'), icon: LayoutDashboard },
    { id: 'usage', label: t('Usage'), icon: BarChart3 },
    // The count is what nobody has looked at yet, and only shown when there is some.
    { id: 'feedback', label: t('Feedback'), icon: MessageSquare, count: stats.new_feedback || undefined },
    { id: 'users', label: t('Users'), icon: Users, count: stats.total_users },
    { id: 'recipes', label: t('Recipes'), icon: BookOpen, count: stats.total_recipes },
    { id: 'logs', label: t('AI Logs'), icon: Sparkles, count: stats.total_ai_calls },
    { id: 'system', label: t('System'), icon: Activity },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-serif font-normal text-zinc-900 dark:text-zinc-50">{t('Admin Dashboard')}</h2>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> {t('Refresh')}
        </Button>
      </div>

      {/* Scrolls sideways on a narrow phone, from the screen's edge, rather
          than squeezing the tabs or pushing the page wider. */}
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label={t('Admin sections')} idPrefix="admin" layout="fit" className="-mx-4 px-4 sm:mx-0 sm:px-0" />

      <div id="admin-panel" role="tabpanel" aria-labelledby={`admin-tab-${tab}`} className="space-y-6">
      {tab === 'system' && <SystemCheck />}
      {tab === 'usage' && <AdminUsage reloadKey={usageReload} />}
      {tab === 'feedback' && (
        <AdminFeedback
          reloadKey={usageReload}
          onNewCountChange={(delta) => setStats((s) => (s ? { ...s, new_feedback: Math.max(0, (s.new_feedback ?? 0) + delta) } : s))}
        />
      )}

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard icon={Users} label={t('Total users')} value={stats.total_users} />
            <StatCard icon={BookOpen} label={t('Total recipes')} value={stats.total_recipes} />
            <StatCard icon={Sparkles} label={t('AI calls total')} value={stats.total_ai_calls} />
            <StatCard icon={Calendar} label={t('AI calls today')} value={stats.calls_today} />
            <StatCard icon={TrendingUp} label={t('AI calls this week')} value={stats.calls_this_week} />
          </div>

          {stats.model_breakdown.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
              <h3 className="font-bold text-zinc-900 dark:text-zinc-50">{t('Model usage')}</h3>
              <div className="space-y-2">
                {stats.model_breakdown.map(({ model, count }) => {
                  const pct = Math.round((count / stats.total_ai_calls) * 100);
                  return (
                    <div key={model} className="flex items-center gap-3">
                      <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400 w-52 shrink-0 truncate">{model}</span>
                      <div className="flex-1 h-2 bg-sk-surface-low dark:bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-sk-primary dark:bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400 w-20 text-right shrink-0">{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    <th className="text-left px-6 py-3 font-semibold">{t('Email')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{t('Joined')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{t('Last seen')}</th>
                    <th className="text-right px-4 py-3 font-semibold">{t('Recipes')}</th>
                    <th className="text-right px-4 py-3 font-semibold">{t('AI calls')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                  {usersLoading ? (
                    <tr><td colSpan={6} className="px-6 py-10 text-center text-zinc-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />{t('Loading…')}</td></tr>
                  ) : users.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-3 font-medium text-zinc-900 dark:text-zinc-100">{u.email}</td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{formatDate(u.last_sign_in_at)}</td>
                      <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">
                        <button onClick={() => viewUserRecipes(u)} className="hover:text-sk-primary hover:underline">{u.recipe_count}</button>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">{u.ai_call_count}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setConfirmDelete(u)} disabled={deletingId === u.id} className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title={t('Delete user')}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pager page={usersPage} setPage={setUsersPage} pageSize={PAGE_SIZE} total={usersTotal} />
        </div>
      )}

      {/* Recipes tab: the vault's search field and chips, one row per recipe */}
      {tab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center flex-wrap">
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-sk-outline dark:text-muted-foreground pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
                placeholder={t("Search everyone's recipes by title…")}
                aria-label={t('Search recipes by title')}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border-0 bg-sk-surface-highest dark:bg-input text-sk-on-surface dark:text-foreground text-sm font-sans focus:outline-none focus:ring-2 focus:ring-sk-primary/25 dark:focus:ring-primary/25 transition placeholder:text-sk-outline dark:placeholder:text-muted-foreground"
              />
              {recipeSearch && (
                <button
                  type="button"
                  onClick={() => setRecipeSearch('')}
                  aria-label={t('Clear search')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sk-outline hover:text-sk-primary dark:hover:text-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {ownerFilter && (
              <span className={`${chipClass(true)} max-w-full`}>
                <UserRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{ownerFilter.email}</span>
                <button
                  type="button"
                  onClick={() => setOwnerFilter(null)}
                  aria-label={t("Show everyone's recipes")}
                  className="-mr-1 p-0.5 rounded hover:text-destructive transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            {recipesLoading ? (
              <p role="status" className="px-6 py-10 text-center text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" aria-hidden="true" />{t('Loading…')}
              </p>
            ) : recipes.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                {recipeSearch || ownerFilter ? t('No recipes match.') : t('No recipes yet.')}
              </p>
            ) : (
              <ul aria-label={t('Recipes')} className="divide-y divide-sk-outline-variant/30 dark:divide-white/5">
                {recipes.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => openRecipe(r)}
                      data-pressable="surface"
                      className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 text-left hover:bg-sk-surface-low/60 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      {r.image_url ? (
                        <img src={r.image_url} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                      ) : (
                        <span aria-hidden="true" className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center bg-gradient-to-br from-sk-primary-fixed via-sk-surface-low to-sk-surface-highest dark:from-primary/20 dark:via-muted dark:to-muted font-serif text-xl text-sk-primary/40 dark:text-primary/40">
                          {r.title[0]?.toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-center gap-1.5">
                          <span className="font-semibold font-sans text-sk-on-surface dark:text-foreground truncate">{r.title}</span>
                          {r.is_favourite && <Star className="w-3.5 h-3.5 shrink-0 fill-sk-primary text-sk-primary dark:fill-primary dark:text-primary" aria-label={t('Favourite##marked')} />}
                        </span>
                        <span className="block text-xs font-sans text-sk-on-surface-variant dark:text-muted-foreground truncate">
                          {r.user_email ?? t('No account')} · {formatDate(r.created_at)}
                        </span>
                        {r.tags && r.tags.length > 0 && (
                          <span className="hidden sm:flex gap-1 flex-wrap">
                            {r.tags.slice(0, 4).map((tag) => (
                              <span key={tag} className={tagClass()}>{t(tagLabel(tag))}</span>
                            ))}
                          </span>
                        )}
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0 text-sk-outline dark:text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Pager page={recipesPage} setPage={setRecipesPage} pageSize={PAGE_SIZE} total={recipesTotal} />
        </div>
      )}

      {/* Logs tab */}
      {tab === 'logs' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    <th className="text-left px-6 py-3 font-semibold">{t('Time')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{t('User')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{t('Endpoint')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{t('Model')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{t('Status')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{t('Reasoning')}</th>
                    <th className="text-right px-4 py-3 font-semibold">{t('Latency')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                  {logsLoading ? (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-zinc-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />{t('Loading…')}</td></tr>
                  ) : logs.map((l) => (
                    <tr key={l.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-xs">{formatTime(l.created_at)}</td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400 text-xs max-w-[160px] truncate">{l.user_email ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-700 dark:text-zinc-300">{l.endpoint}</td>
                      <td
                        className="px-4 py-2.5 font-mono text-xs text-zinc-500 dark:text-zinc-400"
                        title={l.model_version && l.model_version !== l.model ? t('{model} resolved to {version}', { model: l.model ?? '', version: l.model_version }) : undefined}
                      >
                        {l.model_version ?? l.model ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${l.status === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
                          {l.status === 'success' ? t('success##log status') : l.status === 'error' ? t('error##log status') : l.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs"><ReasoningTag state={l.thinking} /></td>
                      <td className="px-4 py-2.5 text-right text-xs text-zinc-500 dark:text-zinc-400">
                        {l.latency_ms != null ? `${l.latency_ms}ms` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pager page={logsPage} setPage={setLogsPage} pageSize={PAGE_SIZE} total={logsTotal} />
        </div>
      )}

      </div>

      {/* Someone's recipe, drawn like the recipe drawer, with the edit form nested inside */}
      {viewingRecipe && (
        <AdminRecipeView
          recipe={viewingRecipe.recipe}
          title={viewingRecipe.title}
          imageUrl={viewingRecipe.imageUrl}
          ownerEmail={viewingRecipe.ownerEmail}
          onClose={() => { setEditingRecipe(null); setViewingRecipe(null); }}
          onEdit={setEditingRecipe}
          onRegenerate={rerun}
          regenerating={rerunning}
          nestedDialogs={editingRecipe && (
            // Saves via the service key, bypassing owner RLS
            <RecipeForm
              isOpen
              editingRecipe={editingRecipe}
              onClose={() => setEditingRecipe(null)}
              onSave={handleAdminSave}
              // attach to the recipe's owner, not the admin doing the editing
              userId={editingRecipe.user_id ?? null}
            />
          )}
        />
      )}

      {/* Delete user confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-red-600 dark:text-red-400">{t('Delete user?')}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {rich(t, 'This will permanently delete <b>{email}</b> and all their recipes, meal plans, and settings.', {
                b: (text) => <span className="font-semibold text-zinc-900 dark:text-zinc-100">{text}</span>,
              }, { email: confirmDelete.email })}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)} className="flex-1">{t('Cancel')}</Button>
              <Button onClick={() => handleDeleteUser(confirmDelete)} disabled={deletingId === confirmDelete.id} className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0">
                {deletingId === confirmDelete.id ? t('Deleting…') : t('Delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
