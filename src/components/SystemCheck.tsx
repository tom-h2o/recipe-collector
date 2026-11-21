import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MinusCircle, Play, XCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { AI_TASKS, MODEL_OPTIONS } from '@/lib/constants';
import type { AiTask, ThinkingState } from '@/types';

/**
 * The admin System tab. Shapes mirror api/_lib/systemCheck.ts.
 *
 * Configuration and reasoning load with the tab and call nothing outside the
 * app. The live checks cost a little — one small Gemini request per model, an
 * embedding, an Unsplash search — so they run only when "Run check" is pressed.
 */

type CheckStatus = 'ok' | 'warn' | 'fail' | 'skipped';

interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  latency_ms?: number | null;
}

interface ReasoningUsage {
  model: string;
  on: number;
  off: number;
  minimal: number;
  low: number;
  refused: number;
  unrecorded: number;
}

interface ReasoningRow {
  task: AiTask;
  reasoning: 'on' | 'off';
  model: string;
  usage: ReasoningUsage[];
}

interface HealthOverview {
  config: CheckResult[];
  expected_schema: string;
  reasoning: { since: string; usage_available: boolean; tasks: ReasoningRow[] };
}

interface ModelProbe {
  model: string;
  kind: 'chat' | 'embedding';
  status: CheckStatus;
  detail: string;
  latency_ms: number | null;
  model_version: string | null;
  /** The lowest reasoning setting the model accepted. */
  reasoning: ThinkingState | 'unknown' | 'n/a';
}

interface LiveReport {
  checked_at: string;
  services: CheckResult[];
  models: ModelProbe[];
}

const STATUS: Record<CheckStatus, { icon: React.ElementType; label: string; className: string }> = {
  ok: { icon: CheckCircle2, label: 'OK', className: 'text-emerald-600 dark:text-emerald-400' },
  warn: { icon: AlertTriangle, label: 'Warning', className: 'text-amber-500 dark:text-amber-400' },
  fail: { icon: XCircle, label: 'Failing', className: 'text-red-600 dark:text-red-400' },
  skipped: { icon: MinusCircle, label: 'Not checked', className: 'text-zinc-400 dark:text-zinc-500' },
};

function StatusIcon({ status }: { status: CheckStatus }) {
  const { icon: Icon, label, className } = STATUS[status];
  return (
    <span className={`shrink-0 mt-0.5 ${className}`} title={label}>
      <Icon className="w-4 h-4" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Summary({ items }: { items: { status: CheckStatus }[] }) {
  const failing = items.filter((i) => i.status === 'fail').length;
  const warnings = items.filter((i) => i.status === 'warn').length;
  if (failing) return <span className="text-xs font-semibold text-red-600 dark:text-red-400">{failing} failing{warnings ? `, ${warnings} warning${warnings > 1 ? 's' : ''}` : ''}</span>;
  if (warnings) return <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{warnings} warning{warnings > 1 ? 's' : ''}</span>;
  return <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">All OK</span>;
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="font-bold text-zinc-900 dark:text-zinc-50">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function CheckRow({ status, title, subtitle, detail, meta }: { status: CheckStatus; title: string; subtitle?: string; detail: string; meta?: React.ReactNode }) {
  return (
    <li className="flex gap-3 px-5 py-3">
      <StatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
          {subtitle && <span className="text-xs font-mono text-zinc-400 break-all">{subtitle}</span>}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 break-words">{detail}</p>
        {meta && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">{meta}</div>}
      </div>
    </li>
  );
}

function ms(value: number | null | undefined): string | null {
  if (value == null) return null;
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

const TASK_LABEL = Object.fromEntries(AI_TASKS.map((t) => [t.task, t.label])) as Record<AiTask, string>;
const TIER_NAME = Object.fromEntries(MODEL_OPTIONS.map((m) => [m.id, m.name])) as Record<string, string>;

function modelTitle(probe: ModelProbe): string {
  if (probe.kind === 'embedding') return 'Recipe search';
  return TIER_NAME[probe.model] ?? 'Chosen by a user';
}

function UsageSummary({ usage, available }: { usage: ReasoningUsage[]; available: boolean }) {
  if (!available) return <span className="text-zinc-400">Not recorded yet</span>;
  if (usage.length === 0) return <span className="text-zinc-400">No calls</span>;
  return (
    <ul className="space-y-0.5">
      {usage.map((u) => {
        const parts = [
          u.off ? `${u.off} off` : null,
          u.minimal ? `${u.minimal} minimal` : null,
          u.low ? `${u.low} low` : null,
          u.on ? `${u.on} on` : null,
          u.unrecorded ? `${u.unrecorded} before recording` : null,
        ].filter(Boolean).join(' · ');
        return (
          <li key={u.model}>
            <span className="font-mono text-zinc-500 dark:text-zinc-400">{u.model}</span>{' '}
            <span className="text-zinc-600 dark:text-zinc-300">{parts}</span>
            {u.refused > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-semibold" title="Reasoning was meant to be lowered, but this model refused every lower setting">
                {parts ? ' · ' : ''}{u.refused} refused
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function SystemCheck() {
  const [overview, setOverview] = useState<HealthOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveReport | null>(null);
  const [running, setRunning] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setOverviewError(null);
    try {
      const res = await apiFetch('/api/account?tab=health');
      if (!res.ok) throw new Error(await readError(res));
      setOverview(await res.json());
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Could not load the configuration.');
    }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  async function runCheck() {
    setRunning(true);
    setLiveError(null);
    try {
      const res = await apiFetch('/api/account?action=health-check', { method: 'POST' });
      if (!res.ok) throw new Error(await readError(res));
      setLive(await res.json());
      // The probes have just been logged, so the evidence column may have moved.
      loadOverview();
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'The check could not be run.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
          Configuration and reasoning are read without calling anything outside the app.
          {' '}<strong className="font-semibold text-zinc-700 dark:text-zinc-200">Run check</strong> also sends one small request to every Gemini model,
          an embedding and an Unsplash search. Those calls appear in the AI logs as <code className="font-mono text-xs">health-check</code> and
          do not count against the daily limit.
        </p>
        <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
          <Button onClick={runCheck} disabled={running} className="gap-1.5">
            {running ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
            {running ? 'Checking…' : 'Run check'}
          </Button>
          {live && (
            <span className="text-[11px] text-zinc-400">Last run {new Date(live.checked_at).toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {liveError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{liveError}</p>
      )}

      <Card title="Services" aside={live ? <Summary items={live.services} /> : null}>
        {live ? (
          <ul className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
            {live.services.map((s) => (
              <CheckRow key={s.id} status={s.status} title={s.label} detail={s.detail} meta={ms(s.latency_ms) && <span>{ms(s.latency_ms)}</span>} />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-zinc-400">{running ? 'Checking…' : 'Not checked yet. Press Run check.'}</p>
        )}
      </Card>

      <Card title="Gemini models" aside={live ? <Summary items={live.models} /> : null}>
        {live ? (
          <ul className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
            {live.models.map((m) => (
              <CheckRow
                key={m.model}
                status={m.status}
                title={modelTitle(m)}
                subtitle={m.model}
                detail={m.detail}
                meta={<>
                  {(m.reasoning === 'off' || m.reasoning === 'minimal' || m.reasoning === 'low') && <span>Lowest reasoning: {m.reasoning}</span>}
                  {m.reasoning === 'refused' && <span className="text-amber-600 dark:text-amber-400 font-semibold">Lowest reasoning: refused</span>}
                  {m.model_version && m.model_version !== m.model && <span>Answered as <span className="font-mono">{m.model_version}</span></span>}
                  {ms(m.latency_ms) && <span>{ms(m.latency_ms)}</span>}
                </>}
              />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-zinc-400">{running ? 'Checking…' : 'Not checked yet. Press Run check.'}</p>
        )}
      </Card>

      <Card title="Reasoning per task" aside={overview ? <span className="text-[11px] text-zinc-400">Calls in the last 7 days</span> : null}>
        {overviewError ? (
          <p role="alert" className="px-5 py-4 text-sm text-red-600 dark:text-red-400">{overviewError}</p>
        ) : !overview ? (
          <p className="px-5 py-4 text-sm text-zinc-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" aria-hidden="true" />Loading…</p>
        ) : (
          // A table from 640px up; below that each task stacks, because four
          // columns do not fit a phone and the last one is the one that matters.
          <table className="w-full text-sm">
            <thead className="hidden sm:table-header-group">
              <tr className="border-b border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                <th className="text-left px-5 py-2.5 font-semibold">Task</th>
                <th className="text-left px-3 py-2.5 font-semibold">Reasoning</th>
                <th className="text-left px-3 py-2.5 font-semibold">Model (your settings)</th>
                <th className="text-left px-3 py-2.5 font-semibold">What ran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
              {overview.reasoning.tasks.map((t) => (
                <tr key={t.task} data-task={t.task} className="block sm:table-row px-5 py-3 sm:p-0">
                  <td className="inline sm:table-cell sm:px-5 sm:py-2.5 font-medium text-zinc-800 dark:text-zinc-200 sm:whitespace-nowrap">{TASK_LABEL[t.task] ?? t.task}</td>
                  <td className="inline sm:table-cell ml-2 sm:ml-0 sm:px-3 sm:py-2.5">
                    <span
                      title={t.reasoning === 'off'
                        ? 'Runs at the lowest reasoning the model accepts: off on Gemini 2.5, minimal or low on Gemini 3 and later'
                        : 'Runs at the model\'s default reasoning'}
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${t.reasoning === 'off'
                        ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}
                    >
                      {t.reasoning === 'off' ? 'lowest' : 'default'}
                    </span>
                  </td>
                  <td className="block sm:table-cell mt-1 sm:mt-0 sm:px-3 sm:py-2.5 font-mono text-xs text-zinc-500 dark:text-zinc-400 sm:whitespace-nowrap break-all">
                    <span className="sm:hidden font-sans text-zinc-400">Model </span>{t.model}
                  </td>
                  <td className="block sm:table-cell mt-1 sm:mt-0 sm:px-3 sm:py-2.5 text-xs">
                    <span className="block sm:hidden text-zinc-400">Last 7 days</span>
                    <UsageSummary usage={t.usage} available={overview.reasoning.usage_available} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Configuration" aside={overview ? <Summary items={overview.config} /> : null}>
        {overview ? (
          <ul className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
            {overview.config.map((c) => (
              <CheckRow key={c.id} status={c.status} title={c.label} detail={c.detail} />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-zinc-400">{overviewError ?? 'Loading…'}</p>
        )}
      </Card>
    </div>
  );
}
