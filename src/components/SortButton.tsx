import { useCallback, useRef, useState } from 'react';
import { ArrowUpDown, Check } from 'lucide-react';
import { AnchoredMenu } from '@/components/AnchoredMenu';
import { SORT_OPTIONS, type SortOption } from '@/lib/constants';
import { useT } from '@/i18n';

/**
 * The vault's sort order as a square button beside the search field, with the
 * choices in a menu. It was a select showing "Newest first", which took half
 * the row on a phone and cut the search field's own hint short.
 */
export function SortButton({ value, onChange }: { value: SortOption; onChange: (next: SortOption) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('Sort recipes: {label}', { label: t(current.label) })}
        title={t('Sorted: {label}', { label: t(current.label) })}
        className="inline-flex shrink-0 items-center justify-center gap-2 h-10 w-10 sm:w-auto sm:px-3.5 rounded-xl bg-sk-surface-highest dark:bg-input text-sk-on-surface-variant dark:text-muted-foreground text-sm font-sans hover:text-sk-primary dark:hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-sk-primary/25 transition-colors"
      >
        <ArrowUpDown className="w-4 h-4 shrink-0" aria-hidden="true" />
        {/* The order in words where there is room for it. */}
        <span className="hidden sm:inline whitespace-nowrap">{t(current.label)}</span>
      </button>
      <AnchoredMenu open={open} onClose={close} anchorRef={anchor} className="w-52 glass glass-menu rounded-2xl p-1.5 flex flex-col gap-0.5">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={option.value === value}
            onClick={() => { onChange(option.value); close(); }}
            className="w-full flex items-center gap-2.5 px-3 min-h-10 rounded-xl text-left text-sm font-sans text-sk-on-surface dark:text-foreground hover:bg-sk-surface-low/80 dark:hover:bg-white/[0.06] transition-colors"
          >
            <span className="flex-1">{t(option.label)}</span>
            {option.value === value && <Check className="w-4 h-4 text-sk-primary dark:text-primary" aria-hidden="true" />}
          </button>
        ))}
      </AnchoredMenu>
    </>
  );
}
