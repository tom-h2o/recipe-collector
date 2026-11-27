import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/Sheet';
import { FAVOURITES_FILTER, SHARED_FILTER, QUICK_TAG } from '@/lib/constants';
import { NEW_FROM_IPHONE } from '@/store/recipeStore';
import { tn, useLanguage, useT } from '@/i18n';
import { MENU_GROUPS, TagIcon, chipClass, chosenInGroup, setGroupFilter, tagLabel, toggleFilter } from '@/lib/tags';

/**
 * The vault's filters. In the row: one **Filters** button for the tags, what
 * was chosen there as chips with an ✕ right beside it (so a choice is on
 * screen on a phone, not scrolled away), then Favourites and Under 30 min as
 * chips of their own, and Shared at the end. They combine: Vegetarian
 * and Italian shows the recipes that are both.
 *
 * The Filters button opens a sheet with all tags in view at once, by group
 * (Diet, Cuisine, Meal, Main ingredient, More), one choice per group. There
 * used to be a menu per group in the row; on a phone only the first of the
 * five fitted on screen, and the rest had to be scrolled to before anyone
 * knew they were there. Shared was the second chip: it is a property of how a
 * recipe is published, not a kind of recipe, so it now comes last.
 *
 * One row that scrolls sideways on a phone, Clear first so it never scrolls
 * out of sight.
 */
interface Props {
  active: readonly string[];
  onChange: (next: string[]) => void;
  /** Offer "New from iPhone": something new arrived, or the filter is on. */
  showNew: boolean;
  /** Something besides the chips narrows the list (a search). */
  searching: boolean;
  onClearAll: () => void;
}

export function FilterBar({ active, onChange, showNew, searching, onClearAll }: Props) {
  const t = useT();
  const lang = useLanguage();
  const [open, setOpen] = useState(false);
  // What the sheet holds: one chosen tag per group, in the groups' order.
  const chosen = MENU_GROUPS
    .map((group) => ({ group, tag: chosenInGroup(active, group.id) }))
    .filter((c): c is { group: typeof MENU_GROUPS[number]; tag: string } => c.tag !== null);

  return (
    <>
      <div role="group" aria-label={t('Filters')} className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
        {(searching || active.length > 0) && (
          // A bare ✕ on a phone, so what was chosen stays on screen beside it.
          <button type="button" onClick={onClearAll} aria-label={t('Clear')} title={t('Clear search and filters')} className={`${chipClass(false)} max-sm:w-8 max-sm:justify-center max-sm:px-0`}>
            <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> <span className="max-sm:hidden">{t('Clear')}</span>
          </button>
        )}
        {showNew && (
          <DirectChip filter={NEW_FROM_IPHONE} active={active.includes(NEW_FROM_IPHONE)} highlight onClick={() => onChange(toggleFilter(active, NEW_FROM_IPHONE))} />
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={chosen.length > 0 ? tn(chosen.length, 'Filters, {n} chosen', 'Filters, {n} chosen') : t('Filters')}
          className={chipClass(false)}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {t('Filters')}
          {chosen.length > 0 && (
            <span aria-hidden="true" className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-sk-primary dark:bg-primary px-1 text-[10px] font-bold text-white dark:text-primary-foreground">
              {chosen.length}
            </span>
          )}
        </button>
        {chosen.map(({ group, tag }) => (
          // Two buttons in one pill: back to the sheet, or drop this one.
          <span key={group.id} className={`${chipClass(true)} pr-1`}>
            <button type="button" onClick={() => setOpen(true)} aria-label={`${t(group.label)}: ${tagLabel(tag)}`} className="inline-flex items-center gap-1.5 h-full">
              <TagIcon tag={tag} className="w-3.5 h-3.5 shrink-0" />
              {tagLabel(tag)}
            </button>
            <button
              type="button"
              onClick={() => onChange(setGroupFilter(active, group.id, null))}
              // English writes the group in lower case inside the sentence; German nouns keep their capital.
              aria-label={t('Clear {group} filter', { group: lang === 'en' ? group.label.toLowerCase() : t(group.label) })}
              className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        {[FAVOURITES_FILTER, QUICK_TAG].map((f) => (
          <DirectChip key={f} filter={f} active={active.includes(f)} onClick={() => onChange(toggleFilter(active, f))} />
        ))}
        <DirectChip filter={SHARED_FILTER} active={active.includes(SHARED_FILTER)} onClick={() => onChange(toggleFilter(active, SHARED_FILTER))} />
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('Filters')}
        description={t('One per group. Together they narrow the list: Vegetarian and Italian shows recipes that are both.')}
      >
        <div className="space-y-5">
          {MENU_GROUPS.map((group) => {
            const current = chosenInGroup(active, group.id);
            return (
              <section key={group.id} role="group" aria-label={t(group.label)} className="space-y-2">
                <h3 className="text-[11px] font-sans font-semibold uppercase tracking-[0.12em] text-sk-on-surface-variant dark:text-muted-foreground">
                  {t(group.label)}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {group.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={current === tag}
                      // Tapping the chosen one again takes it off.
                      onClick={() => onChange(setGroupFilter(active, group.id, current === tag ? null : tag))}
                      className={chipClass(current === tag)}
                    >
                      <TagIcon tag={tag} className="w-3.5 h-3.5 shrink-0" />
                      {tagLabel(tag)}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        {/* Stays in reach while the tags scroll under it. */}
        <div className="sticky bottom-0 -mx-5 mt-5 flex gap-2 bg-white dark:bg-card px-5 pt-3 pb-1 border-t border-sk-outline-variant/40 dark:border-border">
          <Button
            type="button"
            variant="outline"
            disabled={chosen.length === 0}
            onClick={() => onChange(active.filter((f) => !chosen.some((c) => c.tag === f)))}
            className="flex-1 rounded-full"
          >
            {t('Clear')}
          </Button>
          <Button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-full bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0">
            {t('Show recipes')}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function DirectChip({ filter, active, highlight = false, onClick }: { filter: string; active: boolean; highlight?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={chipClass(active, highlight ? 'highlight' : 'default')}>
      <TagIcon tag={filter} className="w-3.5 h-3.5 shrink-0" />
      {tagLabel(filter)}
    </button>
  );
}
