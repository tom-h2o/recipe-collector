import type { ThinkingState } from '@/types';

const LOOK: Record<ThinkingState, { label: string; title: string; className: string }> = {
  on: {
    label: 'on',
    title: 'Ran with reasoning',
    className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  },
  off: {
    label: 'off',
    title: 'Ran without reasoning, as configured for this task',
    className: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  },
  minimal: {
    label: 'minimal',
    title: 'Ran at the lowest reasoning level, minimal. From Gemini 3 on, reasoning can be lowered but not switched off',
    className: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  },
  low: {
    label: 'low',
    title: 'Ran at low reasoning, the lowest this model offers',
    className: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  },
  refused: {
    label: 'refused',
    title: 'Reasoning was meant to be lowered, but this model refused every lower setting, so it ran at its default',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
};

/** How one AI call reasoned. A dash for calls logged before this was recorded. */
export function ReasoningTag({ state }: { state: ThinkingState | null | undefined }) {
  if (!state || !LOOK[state]) {
    return <span className="text-zinc-400" title="Not recorded for this call">—</span>;
  }
  const look = LOOK[state];
  return (
    <span title={look.title} className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${look.className}`}>
      {look.label}
    </span>
  );
}
