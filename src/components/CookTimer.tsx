import { Timer, Play, Pause, X, Plus } from 'lucide-react';
import { useState } from 'react';
import { formatClock, formatDuration, type ParsedDuration } from '@/lib/parseDurations';
import type { CookTimer as CookTimerState } from '@/hooks/useCookTimer';

interface Props {
  timer: CookTimerState;
  /** Durations found in the current step, offered as one-tap chips. */
  suggestions: ParsedDuration[];
}

const MANUAL_MINUTES = [1, 3, 5, 10, 15, 30];

/**
 * The timer strip in cook mode.
 *
 * Idle it offers whatever the step mentions, plus a manual set — about a quarter
 * of steps in this vault name a duration, so the manual row is the common case,
 * not the fallback.
 */
export function CookTimer({ timer, suggestions }: Props) {
  const [showManual, setShowManual] = useState(false);

  if (timer.isDone) {
    return (
      <div
        role="alert"
        className="shrink-0 mx-4 sm:mx-6 mb-3 rounded-2xl bg-sk-primary px-4 py-3 flex items-center justify-between gap-3 animate-pulse"
      >
        <span className="flex items-center gap-2 font-bold text-white dark:text-primary-foreground">
          <Timer className="w-5 h-5" aria-hidden="true" />
          Time's up
        </span>
        <button
          onClick={timer.dismiss}
          className="px-4 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white dark:text-primary-foreground font-semibold text-sm transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (timer.isActive) {
    const pct = timer.total > 0 ? ((timer.total - timer.remaining) / timer.total) * 100 : 0;
    return (
      <div className="shrink-0 mx-4 sm:mx-6 mb-3 rounded-2xl bg-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span
            className="font-mono text-2xl font-bold text-white tabular-nums"
            role="timer"
            aria-live="off"
            aria-label={`${formatClock(timer.remaining)} remaining`}
          >
            {formatClock(timer.remaining)}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={timer.isRunning ? timer.pause : timer.resume}
              aria-label={timer.isRunning ? 'Pause timer' : 'Resume timer'}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              {timer.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={timer.clear}
              aria-label="Cancel timer"
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-sk-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 sm:px-6 mb-3">
      <Timer className="w-4 h-4 text-white/40 shrink-0" aria-hidden="true" />
      {suggestions.map((d) => (
        <button
          key={d.seconds}
          onClick={() => timer.start(d.seconds)}
          className="px-3 py-1.5 rounded-full bg-sk-primary/20 hover:bg-sk-primary/30 text-sk-primary-fixed text-sm font-semibold transition-colors"
        >
          {d.label}
        </button>
      ))}

      {showManual
        ? MANUAL_MINUTES.map((m) => (
            <button
              key={m}
              onClick={() => { timer.start(m * 60); setShowManual(false); }}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-sm font-semibold transition-colors"
            >
              {formatDuration(m * 60)}
            </button>
          ))
        : (
          <button
            onClick={() => setShowManual(true)}
            aria-label="Set a timer"
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 text-sm font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Timer
          </button>
        )}
    </div>
  );
}
