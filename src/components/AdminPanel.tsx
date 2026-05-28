import { useState, useEffect, useCallback } from 'react';
import { Users, BookOpen, Sparkles, Trash2, RefreshCw, Calendar, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { AdminUser, AdminStats, AdminLog } from '@/types';

interface AdminData {
  stats: AdminStats;
  users: AdminUser[];
  logs: AdminLog[];
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-sk-surface-low dark:bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-sk-primary dark:text-primary" />
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
        {sub && <p className="text-xs text-sk-primary dark:text-primary font-medium">{sub}</p>}
      </div>
    </div>
  );
}

export function AdminPanel() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin');
      if (!res.ok) throw new Error((await res.json()).error);
      setData(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDeleteUser(user: AdminUser) {
    setDeletingId(user.id);
    try {
      const res = await apiFetch(`/api/admin?userId=${user.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Deleted ${user.email}`);
      setData((prev) => prev ? { ...prev, users: prev.users.filter((u) => u.id !== user.id) } : prev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-sk-on-surface-variant dark:text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading admin data…
      </div>
    );
  }

  if (!data) return null;

  const { stats, users, logs } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-serif font-normal text-zinc-900 dark:text-zinc-50">Admin Dashboard</h2>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard icon={Users} label="Total users" value={stats.total_users} />
        <StatCard icon={BookOpen} label="Total recipes" value={stats.total_recipes} />
        <StatCard icon={Sparkles} label="AI calls total" value={stats.total_ai_calls} />
        <StatCard icon={Calendar} label="AI calls today" value={stats.calls_today} />
        <StatCard icon={TrendingUp} label="AI calls this week" value={stats.calls_this_week} />
      </div>

      {/* Model breakdown */}
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
                  <span className="text-sm text-zinc-500 dark:text-zinc-400 w-16 text-right shrink-0">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h3 className="font-bold text-zinc-900 dark:text-zinc-50">Users ({users.length})</h3>
        </div>
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
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-3 font-medium text-zinc-900 dark:text-zinc-100">{u.email}</td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{formatDate(u.last_sign_in_at)}</td>
                  <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">{u.recipe_count}</td>
                  <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">{u.ai_call_count}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setConfirmDelete(u)}
                      disabled={deletingId === u.id}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Delete user"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent AI logs */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h3 className="font-bold text-zinc-900 dark:text-zinc-50">Recent AI calls (last 100)</h3>
        </div>
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
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-xs">{formatTime(l.created_at)}</td>
                  <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400 text-xs max-w-[160px] truncate">{l.user_email ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-700 dark:text-zinc-300">{l.endpoint}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">{l.model ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      l.status === 'success'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
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
              <Button
                onClick={() => handleDeleteUser(confirmDelete)}
                disabled={deletingId === confirmDelete.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
              >
                {deletingId === confirmDelete.id ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
