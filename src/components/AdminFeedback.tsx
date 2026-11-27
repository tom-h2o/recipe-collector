import { useCallback, useEffect, useState } from 'react';
import { Bug, Lightbulb, MessageSquare, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { describeFeedbackContext } from '@/lib/feedback';
import { chipClass } from '@/lib/tags';
import type { AdminFeedbackRow, FeedbackKind, FeedbackStatus } from '@/types';

/**
 * Admin → Feedback: what people sent from "Send feedback" and from the
 * failure screen (migration 0078), newest first, with the context the app
 * added and a status the admin sets: new, seen, done.
 */
const PAGE_SIZE = 25;

const KIND: Record<FeedbackKind, { label: string; icon: React.ElementType }> = {
  bug: { label: 'Bug', icon: Bug },
  idea: { label: 'Idea', icon: Lightbulb },
  other: { label: 'Other', icon: MessageSquare },
};

const STATUSES: { id: FeedbackStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'seen', label: 'Seen' },
  { id: 'done', label: 'Done' },
];

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  reloadKey?: number;
  /** Told how the number of new reports changed, so the tab's badge can follow. */
  onNewCountChange?: (delta: number) => void;
}

export function AdminFeedback({ reloadKey = 0, onNewCountChange }: Props) {
  const [rows, setRows] = useState<AdminFeedbackRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/account?tab=feedback&page=${p}&pageSize=${PAGE_SIZE}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setRows(data.feedback ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('The feedback could not be loaded. If this is right after a deploy, the database migration may still be running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [page, reloadKey, load]);

  async function setStatus(row: AdminFeedbackRow, status: FeedbackStatus) {
    if (row.status === status) return;
    setActionError(null);
    const before = rows;
    setRows(rows.map((r) => (r.id === row.id ? { ...r, status } : r)));
    try {
      const res = await apiFetch('/api/account?action=feedback-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, status }),
      });
      if (!res.ok) throw new Error('failed');
      onNewCountChange?.(Number(status === 'new') - Number(row.status === 'new'));
    } catch {
      // Put it back: the row must not claim a status the database does not hold.
      setRows(before);
      setActionError('The status could not be saved. Please try again.');
    }
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500 dark:text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin" aria-label="Loading feedback" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="text-center py-12 space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{error}</p>
        <Button variant="outline" size="sm" onClick={() => load(page)} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
        <MessageSquare className="w-10 h-10 mx-auto mb-3 text-zinc-300 dark:text-zinc-700" aria-hidden />
        <p className="font-semibold text-zinc-700 dark:text-zinc-200">No feedback yet</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Reports sent from the account menu appear here.</p>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {actionError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      <ul className="space-y-3">
        {rows.map((row) => {
          const kind = KIND[row.kind] ?? KIND.other;
          const Icon = kind.icon;
          return (
            <li key={row.id} className={`bg-white dark:bg-zinc-900 border rounded-2xl p-5 space-y-3 ${row.status === 'new' ? 'border-sk-primary/40 dark:border-primary/40' : 'border-zinc-200 dark:border-zinc-800'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-100">
                  <Icon className="w-3.5 h-3.5" aria-hidden /> {kind.label}
                </span>
                <span className="min-w-0 truncate">{row.user_email ?? 'Unknown account'}</span>
                <span>{when(row.created_at)}</span>
              </div>
              <p className="text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap break-words">{row.message}</p>
              <details className="text-xs text-zinc-500 dark:text-zinc-400">
                <summary className="cursor-pointer font-semibold">Context</summary>
                <dl className="mt-2 space-y-1">
                  {describeFeedbackContext(row.context ?? {}).map((line) => (
                    <div key={line.label} className="flex gap-2">
                      <dt className="shrink-0 w-24 text-zinc-400 dark:text-zinc-500">{line.label}</dt>
                      <dd className="min-w-0 break-words">{line.value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
              <div role="group" aria-label="Status" className="flex gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={row.status === s.id}
                    onClick={() => setStatus(row, s.id)}
                    className={chipClass(row.status === s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
          <span>Page {page + 1} of {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
