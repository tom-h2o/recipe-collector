import { useState, useEffect, useCallback } from 'react';
import { Users, BookOpen, Sparkles, Trash2, RefreshCw, Calendar, TrendingUp, Star, ChevronLeft, ChevronRight, X, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PublicRecipe } from '@/components/PublicRecipe';
import { RecipeForm } from '@/components/RecipeForm';
import type { AdminUser, AdminStats, AdminLog, AdminRecipe, Recipe } from '@/types';

type Tab = 'overview' | 'users' | 'recipes' | 'logs';

const PAGE_SIZE = 25;

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
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
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
      <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
      <div className="flex gap-1">
        <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>('overview');

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
    { id: string; title: string; ownerEmail: string | null; recipe: Recipe | null } | null
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
      const message = err instanceof Error ? err.message : 'Failed to load admin stats';
      setStatsError(message);
      toast.error(message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

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
      toast.error(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

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
      toast.error(err instanceof Error ? err.message : 'Failed to load recipes');
    } finally {
      setRecipesLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setRecipeSearchDebounced(recipeSearch), 300);
    return () => clearTimeout(t);
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
      toast.error(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === 'logs') loadLogs(logsPage); }, [tab, logsPage, loadLogs]);

  function refresh() {
    loadStats();
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
      toast.success(`Deleted ${user.email}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setUsersTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
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
    setViewingRecipe({ id: r.id, title: r.title, ownerEmail: r.user_email, recipe: null });
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
      toast.error(err instanceof Error ? err.message : 'Failed to load recipe');
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
    const id = toast.loading(kind === 'tag' ? 'Re-tagging recipe…' : 'Re-analysing nutrition…');
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
      toast.success(kind === 'tag' ? 'Tags regenerated' : 'Nutrition regenerated', { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to re-run ${kind}`, { id });
    } finally {
      setRerunning(null);
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-sk-on-surface-variant dark:text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading admin data…
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-4 py-16 text-center">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Admin data unavailable</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
          {statsError ?? 'The dashboard could not be loaded.'}
        </p>
        <Button variant="outline" size="sm" onClick={loadStats} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </Button>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users', count: stats.total_users },
    { id: 'recipes', label: 'Recipes', count: stats.total_recipes },
    { id: 'logs', label: 'AI Logs', count: stats.total_ai_calls },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-serif font-normal text-zinc-900 dark:text-zinc-50">Admin Dashboard</h2>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex bg-sk-surface-low dark:bg-muted rounded-full p-1 gap-0.5 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 ${
              tab === t.id
                ? 'bg-white dark:bg-card shadow-sm text-sk-primary dark:text-primary'
                : 'text-sk-on-surface-variant dark:text-muted-foreground hover:text-sk-primary dark:hover:text-primary'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-sk-primary-fixed text-sk-on-primary-fixed' : 'bg-sk-surface-high dark:bg-muted text-sk-on-surface-variant'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard icon={Users} label="Total users" value={stats.total_users} />
            <StatCard icon={BookOpen} label="Total recipes" value={stats.total_recipes} />
            <StatCard icon={Sparkles} label="AI calls total" value={stats.total_ai_calls} />
            <StatCard icon={Calendar} label="AI calls today" value={stats.calls_today} />
            <StatCard icon={TrendingUp} label="AI calls this week" value={stats.calls_this_week} />
          </div>

          {stats.model_breakdown.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
              <h3 className="font-bold text-zinc-900 dark:text-zinc-50">Model usage</h3>
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
                    <th className="text-left px-6 py-3 font-semibold">Email</th>
                    <th className="text-left px-4 py-3 font-semibold">Joined</th>
                    <th className="text-left px-4 py-3 font-semibold">Last seen</th>
                    <th className="text-right px-4 py-3 font-semibold">Recipes</th>
                    <th className="text-right px-4 py-3 font-semibold">AI calls</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                  {usersLoading ? (
                    <tr><td colSpan={6} className="px-6 py-10 text-center text-zinc-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</td></tr>
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
                        <button onClick={() => setConfirmDelete(u)} disabled={deletingId === u.id} className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete user">
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

      {/* Recipes tab */}
      {tab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center flex-wrap">
            <input
              type="text"
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
              placeholder="Search recipes…"
              className="flex-1 min-w-[160px] h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sk-primary/30"
            />
            {recipeSearch && (
              <Button variant="outline" size="sm" onClick={() => setRecipeSearch('')}>Clear</Button>
            )}
            {ownerFilter && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-sk-surface-low dark:bg-muted text-sk-on-surface-variant dark:text-muted-foreground">
                Owner: {ownerFilter.email}
                <button onClick={() => setOwnerFilter(null)} className="hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
              </span>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    <th className="text-left px-6 py-3 font-semibold">Recipe</th>
                    <th className="text-left px-4 py-3 font-semibold">Owner</th>
                    <th className="text-right px-4 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                  {recipesLoading ? (
                    <tr><td colSpan={3} className="px-6 py-10 text-center text-zinc-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</td></tr>
                  ) : recipes.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-10 text-center text-zinc-400">No recipes found.</td></tr>
                  ) : recipes.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => openRecipe(r)}
                      title={`Open "${r.title}"`}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          {r.image_url ? (
                            <img src={r.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-sk-surface-low dark:bg-muted flex items-center justify-center shrink-0 text-sm font-serif text-sk-primary/30">
                              {r.title[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{r.title}</p>
                              {r.is_favourite && <Star className="w-3 h-3 text-amber-400 shrink-0 fill-current" />}
                            </div>
                            {r.tags && r.tags.length > 0 && (
                              <div className="flex gap-1 mt-0.5 flex-wrap">
                                {r.tags.slice(0, 4).map((tag) => (
                                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-sk-surface-low dark:bg-muted text-sk-on-surface-variant dark:text-muted-foreground">{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 max-w-[200px] truncate">{r.user_email ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {formatDate(r.created_at)}
                          <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                    <th className="text-left px-6 py-3 font-semibold">Time</th>
                    <th className="text-left px-4 py-3 font-semibold">User</th>
                    <th className="text-left px-4 py-3 font-semibold">Endpoint</th>
                    <th className="text-left px-4 py-3 font-semibold">Model</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-right px-4 py-3 font-semibold">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                  {logsLoading ? (
                    <tr><td colSpan={6} className="px-6 py-10 text-center text-zinc-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</td></tr>
                  ) : logs.map((l) => (
                    <tr key={l.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-xs">{formatTime(l.created_at)}</td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400 text-xs max-w-[160px] truncate">{l.user_email ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-700 dark:text-zinc-300">{l.endpoint}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">{l.model ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${l.status === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
                          {l.status}
                        </span>
                      </td>
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

      {/* Recipe viewer — read-only, admin can inspect any user's recipe */}
      {viewingRecipe && (
        <div
          className="fixed inset-0 z-50 bg-black/60 overflow-y-auto p-4 sm:p-8"
          onClick={() => setViewingRecipe(null)}
        >
          <div className="max-w-3xl mx-auto" onClick={(e) => e.stopPropagation()}>
            {/* Own surface so the header stays legible over any page behind it */}
            <div className="flex items-center gap-3 mb-3 text-white bg-zinc-900/90 rounded-xl px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{viewingRecipe.title}</p>
                <p className="text-xs text-white/80 truncate">{viewingRecipe.ownerEmail ?? '(no user)'}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRecipe(null)}
                aria-label="Close recipe"
                className="shrink-0 p-2 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {viewingRecipe.recipe && (
              <div className="flex flex-wrap gap-2 mb-3">
                <Button size="sm" variant="outline" onClick={() => setEditingRecipe(viewingRecipe.recipe)} className="gap-1.5 bg-white dark:bg-zinc-900">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" disabled={rerunning !== null} onClick={() => rerun('tag')} className="gap-1.5 bg-white dark:bg-zinc-900">
                  <RefreshCw className={`w-3.5 h-3.5 ${rerunning === 'tag' ? 'animate-spin' : ''}`} /> Re-tag
                </Button>
                <Button size="sm" variant="outline" disabled={rerunning !== null} onClick={() => rerun('nutrition')} className="gap-1.5 bg-white dark:bg-zinc-900">
                  <RefreshCw className={`w-3.5 h-3.5 ${rerunning === 'nutrition' ? 'animate-spin' : ''}`} /> Re-analyse nutrition
                </Button>
                {viewingRecipe.recipe.tags && viewingRecipe.recipe.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 ml-auto">
                    {viewingRecipe.recipe.tags.map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/15 text-white">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PublicRecipe omits nutrition, so surface it here for the re-run */}
            {viewingRecipe.recipe?.nutrition && (
              <div className="mb-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Nutrition (per serving)</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {([
                    ['Calories', viewingRecipe.recipe.nutrition.calories, 'kcal'],
                    ['Protein', viewingRecipe.recipe.nutrition.protein_g, 'g'],
                    ['Carbs', viewingRecipe.recipe.nutrition.carbs_g, 'g'],
                    ['Fat', viewingRecipe.recipe.nutrition.fat_g, 'g'],
                    ['Fibre', viewingRecipe.recipe.nutrition.fiber_g, 'g'],
                  ] as const).map(([label, value, unit]) => (
                    <span key={label} className="text-zinc-600 dark:text-zinc-300">
                      {label}{' '}
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {value ?? '—'}{value != null ? unit : ''}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {viewingRecipe.recipe ? (
              <PublicRecipe recipe={viewingRecipe.recipe} />
            ) : (
              <div className="flex items-center justify-center py-24 bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 text-sk-on-surface-variant dark:text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading recipe…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin recipe editor — saves via the service key, bypassing owner RLS */}
      <RecipeForm
        isOpen={editingRecipe !== null}
        editingRecipe={editingRecipe}
        onClose={() => setEditingRecipe(null)}
        onSave={handleAdminSave}
        // attach to the recipe's owner, not the admin doing the editing
        userId={editingRecipe?.user_id ?? null}
      />

      {/* Delete user confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-red-600 dark:text-red-400">Delete user?</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              This will permanently delete <span className="font-semibold text-zinc-900 dark:text-zinc-100">{confirmDelete.email}</span> and all their recipes, meal plans, and settings.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)} className="flex-1">Cancel</Button>
              <Button onClick={() => handleDeleteUser(confirmDelete)} disabled={deletingId === confirmDelete.id} className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0">
                {deletingId === confirmDelete.id ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
