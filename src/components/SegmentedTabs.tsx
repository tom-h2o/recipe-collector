import { useEffect, useRef, type ComponentType, type KeyboardEvent } from 'react';
import { usePillPosition } from '@/hooks/usePillPosition';

/**
 * The tab bar inside Settings and on the admin dashboard: one rounded track,
 * and the same tinted pill as the app's main navigation sliding under the
 * chosen tab (usePillPosition, `.tab-pill` in index.css).
 *
 * The two bars used to be built by hand, each differently. Settings' had
 * equal-width tabs with an icon and a label each, which on a phone wrapped
 * "Usage Logs" onto two lines and pushed its icon next to the tab before it.
 * Here a label never wraps: icons show from 640px up, a tab can have a
 * shorter label for a phone, and a bar wider than the screen scrolls sideways
 * rather than squeezing its tabs.
 *
 * A real tablist (role, aria-selected, arrow keys, one tab in the Tab order),
 * which the hand-built bars were not.
 */
export interface SegmentedTab<T extends string> {
  id: T;
  label: string;
  /** Shown instead of `label` below 640px. The tab's name stays `label`. */
  short?: string;
  icon?: ComponentType<{ className?: string }>;
  count?: number;
}

interface Props<T extends string> {
  tabs: readonly SegmentedTab<T>[];
  value: T;
  onChange: (id: T) => void;
  /** The tablist's accessible name. */
  label: string;
  /** Tabs get ids `<idPrefix>-tab-<id>` and point at `<idPrefix>-panel`. */
  idPrefix: string;
  /** fill: the tabs share the full width (a dialog). fit: as wide as they are (a page). */
  layout?: 'fill' | 'fit';
  className?: string;
}

export function SegmentedTabs<T extends string>({ tabs, value, onChange, label, idPrefix, layout = 'fill', className = '' }: Props<T>) {
  const bar = useRef<HTMLDivElement>(null);
  const pill = usePillPosition(bar, value, '[aria-selected="true"]');

  // A bar wider than the screen scrolls; the chosen tab is kept in view.
  useEffect(() => {
    bar.current?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [value]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.id === value);
    const next =
      e.key === 'ArrowRight' ? (index + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    bar.current?.querySelector<HTMLElement>(`#${idPrefix}-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div className={`overflow-x-auto scrollbar-none ${className}`}>
      <div
        ref={bar}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={`relative flex gap-0.5 p-1 rounded-full bg-sk-surface-low dark:bg-muted ${layout === 'fill' ? 'min-w-full w-max' : 'w-max'}`}
      >
        <span aria-hidden="true" className="tab-pill" data-ready={pill.ready} style={pill.style} />
        {tabs.map((tab) => {
          const selected = tab.id === value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel`}
              aria-label={tab.short ? tab.label : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={`relative z-10 h-9 px-3 sm:px-4 inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors duration-200 ${
                layout === 'fill' ? 'flex-auto' : 'shrink-0'
              } ${
                selected
                  ? 'text-sk-primary dark:text-primary'
                  : 'text-sk-on-surface-variant dark:text-muted-foreground hover:text-sk-primary dark:hover:text-primary'
              }`}
            >
              {Icon && <Icon className="hidden sm:block w-4 h-4 shrink-0" />}
              {tab.short
                ? <><span className="sm:hidden">{tab.short}</span><span className="hidden sm:inline">{tab.label}</span></>
                : tab.label}
              {tab.count !== undefined && (
                <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${
                  selected ? 'bg-sk-primary-fixed text-sk-on-primary-fixed' : 'bg-sk-surface-high dark:bg-card text-sk-on-surface-variant dark:text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
