import { useEffect, useState } from 'react';
import { useT } from '@/i18n';

/**
 * What the add-recipe dialog shows while a recipe is being read: the app's key
 * goes into the vault door and turns, the door swings open, a recipe card drops
 * in, and the door closes again, on a loop. Underneath, a line that moves on
 * through what is happening ("Finding the ingredients…").
 *
 * It replaces a spinner overlay that ran alongside a toast saying the same
 * thing: two progress indicators at once. This is the only one.
 *
 * The motion lives in index.css (.vault-anim). With "Reduce motion" on, nothing
 * moves: the key sits in the lock and only the text fades from one line to the
 * next. `done` stops the loop on a closed door with a tick, shown for a moment
 * before the editor opens.
 */

/** One turn of the key, door and card; also how long each line stays. */
export const VAULT_CYCLE_MS = 4200;
/** After this, a line says that long recipes take a while. */
const PATIENCE_AFTER_MS = 25_000;

interface Props {
  /** Announced once to screen readers, e.g. "Reading the recipe". */
  title: string;
  /** Shown one after another, staying on the last. */
  phases: string[];
  done?: boolean;
  doneText?: string;
  onCancel?: () => void;
}

export function VaultAnimation({ title, phases, done = false, doneText, onCancel }: Props) {
  const t = useT();
  const [phase, setPhase] = useState(0);
  const [patience, setPatience] = useState(false);

  useEffect(() => {
    if (done) return;
    const step = setInterval(() => setPhase((p) => Math.min(p + 1, phases.length - 1)), VAULT_CYCLE_MS);
    const wait = setTimeout(() => setPatience(true), PATIENCE_AFTER_MS);
    return () => { clearInterval(step); clearTimeout(wait); };
  }, [done, phases.length]);

  const line = done ? (doneText ?? t('In the vault')) : phases[Math.min(phase, phases.length - 1)];

  return (
    <div className="vault-anim flex flex-col items-center gap-5 px-8 text-center" data-done={done || undefined}>
      <svg viewBox="0 -24 160 144" className="w-44 h-auto overflow-visible" aria-hidden="true">
        {/* The safe: body and feet */}
        <rect x="40" y="106" width="16" height="7" rx="2.5" className="fill-sk-outline-variant dark:fill-zinc-700" />
        <rect x="104" y="106" width="16" height="7" rx="2.5" className="fill-sk-outline-variant dark:fill-zinc-700" />
        <rect x="28" y="12" width="104" height="96" rx="18" strokeWidth="2" className="fill-sk-surface-high stroke-sk-outline-variant dark:fill-zinc-800 dark:stroke-zinc-700" />

        {/* Inside, seen while the door is open */}
        <circle cx="80" cy="60" r="34" className="fill-sk-on-surface/85 dark:fill-black/80" />
        <path d="M52 50h56M52 70h56" strokeWidth="2" className="stroke-white/10" />

        {/* The recipe going in */}
        <g className="vault-card">
          <rect x="67" y="44" width="26" height="32" rx="3.5" strokeWidth="1" className="fill-white stroke-sk-outline-variant dark:fill-zinc-100" />
          <path d="M72 52h16M72 58h16M72 64h10" strokeWidth="1.8" strokeLinecap="round" className="stroke-sk-outline/70" />
          <circle cx="86" cy="70" r="2.6" className="fill-sk-primary" />
        </g>

        {/* The door, hinged on its left edge */}
        <g className="vault-door">
          <circle cx="80" cy="60" r="34" className="fill-sk-primary dark:fill-sk-primary-container" />
          <circle cx="80" cy="60" r="27" fill="none" strokeWidth="1.5" className="stroke-white/25 dark:stroke-black/20" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return <circle key={i} cx={80 + 30.5 * Math.cos(a)} cy={60 + 30.5 * Math.sin(a)} r="1.8" className="fill-white/40 dark:fill-black/25" />;
          })}
          <g className="vault-keyhole">
            <circle cx="80" cy="57" r="4.2" className="fill-sk-on-surface/85 dark:fill-zinc-900" />
            <path d="M77.4 59h5.2l1.6 9h-8.4z" className="fill-sk-on-surface/85 dark:fill-zinc-900" />
          </g>
          <path className="vault-tick stroke-white dark:stroke-zinc-900" d="M70 60l7 7 13-14" fill="none" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* The key: the app's logo, in brass, its tip at the keyhole */}
        <g className="vault-key">
          <g transform="translate(50 32)" fill="none" strokeLinecap="round" className="stroke-[#c8963e] dark:stroke-[#e0b25e]">
            <circle cx="11" cy="11" r="7" strokeWidth="3" />
            <path d="M16.5 14.5 30 28" strokeWidth="3" />
            <path d="M26 24.5 29 21.5" strokeWidth="2.5" />
          </g>
        </g>

        {/* A ring that lights up as the door locks */}
        <circle cx="80" cy="60" r="38.5" fill="none" strokeWidth="2.5" className="vault-glow stroke-sk-primary/60" />
      </svg>

      <div className="space-y-1.5 min-h-[4.5rem]">
        <p role="status" className="font-serif text-xl text-sk-on-surface dark:text-foreground">{title}</p>
        <p key={line} className="vault-line text-sm text-sk-on-surface-variant dark:text-muted-foreground" aria-hidden="true">{line}</p>
        {patience && !done && (
          <p className="vault-line text-xs text-sk-outline dark:text-muted-foreground/80">{t('Long recipes can take up to a minute.')}</p>
        )}
      </div>

      {onCancel && !done && (
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded-full text-sm font-semibold text-sk-on-surface-variant dark:text-muted-foreground hover:bg-sk-surface-container dark:hover:bg-muted transition-colors"
        >
          {t('Cancel')}
        </button>
      )}
    </div>
  );
}
