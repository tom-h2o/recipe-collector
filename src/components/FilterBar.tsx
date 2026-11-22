import { useCallback, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { AnchoredMenu } from '@/components/AnchoredMenu';
import { DIRECT_FILTERS } from '@/lib/constants';
import { NEW_FROM_IPHONE } from '@/store/recipeStore';
import { MENU_GROUPS, TagIcon, chipClass, chosenInGroup, setGroupFilter, tagLabel, toggleFilter } from '@/lib/tags';

/**
 * The vault's filters: Favourites, Shared and Under 30 min as chips of their
 * own, every other tag in a menu per group (Diet, Cuisine, Meal, Main
 * ingredient, More). They combine: Vegetarian and Italian shows the recipes
 * that are both. A group's chip shows what was chosen in it, with an ✕.
 *
 * All 31 tags as chips was too many for a row; seven of them as chips left the
 * other 24 reachable only by tapping a tag on some card. One row that scrolls
 * sideways on a phone, Clear first so it never scrolls out of sight.
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
  return (
    <div role="group" aria-label="Filters" className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
      {(searching || active.length > 0) && (
        <button type="button" onClick={onClearAll} className={chipClass(false)}>
          <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> Clear
        </button>
      )}
      {showNew && (
        <DirectChip filter={NEW_FROM_IPHONE} active={active.includes(NEW_FROM_IPHONE)} highlight onClick={() => onChange(toggleFilter(active, NEW_FROM_IPHONE))} />
      )}
      {DIRECT_FILTERS.map((f) => (
        <DirectChip key={f} filter={f} active={active.includes(f)} onClick={() => onChange(toggleFilter(active, f))} />
      ))}
      {MENU_GROUPS.map((group) => (
        <GroupChip
          key={group.id}
          label={group.label}
          tags={group.tags}
          chosen={chosenInGroup(active, group.id)}
          onChoose={(tag) => onChange(setGroupFilter(active, group.id, tag))}
        />
      ))}
    </div>
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

const MENU_ITEM = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm font-sans text-sk-on-surface dark:text-foreground hover:bg-sk-surface-low/80 dark:hover:bg-white/[0.06] transition-colors';

/** One group's chip and its menu. Chosen: the chip names the tag, with an ✕ beside it. */
function GroupChip({ label, tags, chosen, onChoose }: { label: string; tags: readonly string[]; chosen: string | null; onChoose: (tag: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const choose = (tag: string | null) => { onChoose(tag); close(); };

  const trigger = (
    <button
      ref={anchor}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={chosen ? `${label}: ${tagLabel(chosen)}` : label}
      onClick={() => setOpen((v) => !v)}
      className={chosen ? 'inline-flex items-center gap-1.5 h-full' : chipClass(false)}
    >
      {chosen && <TagIcon tag={chosen} className="w-3.5 h-3.5 shrink-0" />}
      {chosen ? tagLabel(chosen) : label}
      <ChevronDown className={`w-3.5 h-3.5 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
  );

  return (
    <>
      {chosen ? (
        // The chip is two buttons in one pill: open the menu, or clear the choice.
        <span className={`${chipClass(true)} pr-1`}>
          {trigger}
          <button
            type="button"
            onClick={() => onChoose(null)}
            aria-label={`Clear ${label.toLowerCase()} filter`}
            className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </span>
      ) : trigger}
      <AnchoredMenu open={open} onClose={close} anchorRef={anchor} align="start" className="w-56 glass glass-menu rounded-2xl p-1.5 flex flex-col gap-0.5">
        <button type="button" role="menuitemradio" aria-checked={!chosen} onClick={() => choose(null)} className={`${MENU_ITEM} text-sk-on-surface-variant dark:text-muted-foreground`}>
          <span className="w-4 shrink-0" />
          Show all
          {!chosen && <Check className="w-4 h-4 ml-auto text-sk-primary dark:text-primary" aria-hidden="true" />}
        </button>
        {tags.map((tag) => (
          <button key={tag} type="button" role="menuitemradio" aria-checked={chosen === tag} onClick={() => choose(tag)} className={MENU_ITEM}>
            <span className="w-4 shrink-0 flex justify-center text-sk-outline dark:text-muted-foreground">
              <TagIcon tag={tag} className="w-4 h-4" />
            </span>
            {tagLabel(tag)}
            {chosen === tag && <Check className="w-4 h-4 ml-auto text-sk-primary dark:text-primary" aria-hidden="true" />}
          </button>
        ))}
      </AnchoredMenu>
    </>
  );
}
