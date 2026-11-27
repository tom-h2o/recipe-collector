import { useCallback, useEffect, useState } from 'react';
import { Users, BookOpen, Sparkles, Smartphone, Send, Link2, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { chipClass } from '@/lib/tags';
import type { AdminUsage as Usage } from '@/types';
import { IMPORT_LABELS, featureLabel, shortDay } from '@/lib/usageLabels';

/**
 * Admin → Usage: who uses the app, how often and for what, from
 * GET /api/account?tab=usage (admin_usage(), migration 0075).
 *
 * Everything here is counted from what the database holds. "Active" means
 * opened the app or saved something; reading counts only since app opens are
 * recorded (tracking_since). Features that never reach the server (cook mode,
 * timers, filters, printing) cannot appear, and the page says so.
 */

const PERIODS = [7, 30] as const;

const count = (n: number) => n.toLocaleString('en');

function longDay(day: string | null): string {
  if (!day) return '—';
  return new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function Tile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-sk-surface-low dark:bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-sk-primary dark:text-primary" aria-hidden />
      </div>
      <div>
        <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 tabular-nums">{count(value)}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
    </div>
  );
}

const BAR_AREA = 96;

/**
 * One measure per week, as columns: one series, so no legend (the title says
 * what it is), the value on the current week's cap and on the highest, the
 * rest in each column's tooltip and in the table below the charts.
 */
function WeekChart({ title, weeks, valueOf, describe }: {
  title: string;
  weeks: Usage['weeks'];
  valueOf: (week: Usage['weeks'][number]) => number;
  describe: (n: number) => string;
}) {
  const values = weeks.map(valueOf);
  const max = Math.max(0, ...values);
  const last = weeks.length - 1;
  return (
    <figure className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
      <figcaption><h3 className="font-bold text-zinc-900 dark:text-zinc-50">{title}</h3></figcaption>
      <ol className="flex items-end gap-0.5 border-b border-zinc-200 dark:border-zinc-700" style={{ height: BAR_AREA + 20 }}>
        {weeks.map((week, i) => {
          const n = values[i];
          const text = `Week of ${shortDay(week.week_start)}: ${describe(n)}`;
          const labelled = n > 0 && (i === last || n === max);
          return (
            <li key={week.week_start} title={text} className="flex-1 h-full flex flex-col items-center justify-end">
              <span className="sr-only">{text}</span>
              {labelled && (
                <span aria-hidden className="text-[11px] font-medium tabular-nums text-zinc-600 dark:text-zinc-300 mb-1">{count(n)}</span>
              )}
              <div
                aria-hidden
                data-testid="week-bar"
                className="w-6 max-w-full rounded-t bg-sk-primary dark:bg-primary"
                style={{ height: max > 0 ? Math.round((n / max) * BAR_AREA) : 0 }}
              />
            </li>
          );
        })}
      </ol>
      <div aria-hidden className="flex gap-0.5">
        {weeks.map((week, i) => (
          <span key={week.week_start} className={`flex-1 text-center text-[10px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap ${i % 2 === 1 && i !== last ? 'max-sm:invisible' : ''}`}>
            {shortDay(week.week_start)}
          </span>
        ))}
      </div>
    </figure>
  );
}

/**
 * A category's magnitude as a thin bar beside its label, like Overview's model
 * usage. Fixed column widths, so every row's track starts and ends at the same
 * place: with the text column sized per row, a longer note shortened its track
 * and bars of equal value looked different.
 */
function BarRow({ label, value, max, detail }: { label: string; value: number; max: number; detail: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <li className="grid grid-cols-[9.5rem_1fr] sm:grid-cols-[12rem_1fr_11.5rem] items-center gap-x-3 gap-y-1">
      <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{label}</span>
      <div className="h-2 bg-sk-surface-low dark:bg-muted rounded-full overflow-hidden" aria-hidden>
        <div className="h-full bg-sk-primary dark:bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="col-span-2 sm:col-span-1 text-xs text-zinc-500 dark:text-zinc-400 sm:text-right tabular-nums">{detail}</span>
    </li>
  );
}

export function AdminUsage({ reloadKey = 0 }: { reloadKey?: number }) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (period: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/account?tab=usage&days=${period}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
      setUsage(body.usage as Usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The usage report could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, reloadKey, load]);

  const periods = (
    <div className="flex gap-2" role="group" aria-label="Period">
      {PERIODS.map((p) => (
        <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)} className={chipClass(days === p)}>
          Last {p} days
        </button>
      ))}
    </div>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {periods}
        <div role="alert" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{error}</p>
          <Button variant="outline" size="sm" onClick={() => load(days)} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="space-y-4">
        {periods}
        <p className="text-sm text-zinc-500 dark:text-zinc-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</p>
      </div>
    );
  }

  const { totals, weeks, features, imports, people } = usage;
  const maxFeature = Math.max(0, ...features.map((f) => f.calls));
  const maxImport = Math.max(0, ...imports.map((i) => i.count));

  return (
    <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
      {periods}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Tile icon={Users} label="Active people" value={totals.active_people} />
        <Tile icon={BookOpen} label="Recipes added" value={totals.recipes_added} />
        <Tile icon={Sparkles} label="AI calls" value={totals.ai_calls} />
        <Tile icon={Smartphone} label="iPhone imports" value={totals.iphone_imports} />
        <Tile icon={Send} label="Recipes sent" value={totals.shares_sent} />
        <Tile icon={Link2} label="Accounts connected" value={totals.connections_made} />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-3">
        Since {longDay(usage.first_day)}. Active means opened the app or saved something: a recipe, a plan, a list item, a rating, a share.{' '}
        {usage.tracking_since
          ? <>Opening the app counts from {longDay(usage.tracking_since)}; before that, only saving did.</>
          : <>Opening the app will count from the first visit after this release; until then, only saving does.</>}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeekChart title="Active people per week" weeks={weeks} valueOf={(w) => w.active_people} describe={(n) => `${count(n)} ${n === 1 ? 'person' : 'people'}`} />
        <WeekChart title="Recipes added per week" weeks={weeks} valueOf={(w) => w.recipes_added} describe={(n) => `${count(n)} ${n === 1 ? 'recipe' : 'recipes'}`} />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-500 dark:text-zinc-400">Weekly numbers as a table</summary>
        <table className="mt-2 text-sm">
          <thead>
            <tr className="text-xs text-zinc-500 dark:text-zinc-400">
              <th className="text-left pr-6 py-1 font-semibold">Week of</th>
              <th className="text-right pr-6 py-1 font-semibold">Active people</th>
              <th className="text-right py-1 font-semibold">Recipes added</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week_start} className="text-zinc-700 dark:text-zinc-300 tabular-nums">
                <td className="pr-6 py-0.5">{longDay(w.week_start)}</td>
                <td className="text-right pr-6 py-0.5">{count(w.active_people)}</td>
                <td className="text-right py-0.5">{count(w.recipes_added)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-50">Features used</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">From the AI log, which keeps 30 days. Cook mode, timers, filters and printing never reach the server and cannot appear here.</p>
          </div>
          {features.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing in this period.</p>
          ) : (
            <ul className="space-y-2">
              {features.map((f) => (
                <BarRow
                  key={f.endpoint}
                  label={featureLabel(f.endpoint)}
                  value={f.calls}
                  max={maxFeature}
                  detail={`${count(f.calls)} ${f.calls === 1 ? 'time' : 'times'} · ${count(f.people)} ${f.people === 1 ? 'person' : 'people'}${f.failed ? ` · ${count(f.failed)} failed` : ''}`}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-50">From the iPhone</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Recipes sent with the Shortcuts, by what was shared.</p>
          </div>
          {imports.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing in this period.</p>
          ) : (
            <ul className="space-y-2">
              {imports.map((i) => (
                <BarRow
                  key={i.source}
                  label={IMPORT_LABELS[i.source] ?? i.source}
                  value={i.count}
                  max={maxImport}
                  detail={`${count(i.count)}${i.failed ? ` · ${count(i.failed)} failed` : ''}`}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <h3 className="font-bold text-zinc-900 dark:text-zinc-50 px-6 pt-5 pb-2">People</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                <th className="text-left px-6 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Last active</th>
                <th className="text-right px-4 py-3 font-semibold">Days active</th>
                <th className="text-right px-4 py-3 font-semibold">Recipes added</th>
                <th className="text-right px-4 py-3 font-semibold">AI calls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-3 font-medium text-zinc-900 dark:text-zinc-100">{p.email ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{longDay(p.last_active ?? p.last_sign_in_at)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{count(p.active_days)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {count(p.recipes_added)} <span className="text-zinc-400 dark:text-zinc-500">of {count(p.recipes_total)}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{count(p.ai_calls)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-6 py-3 text-xs text-zinc-500 dark:text-zinc-400">Days active, recipes added and AI calls are for the period above.</p>
      </section>
    </div>
  );
}
