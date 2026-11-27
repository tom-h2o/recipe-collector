import { createElement } from 'react';
import {
  Beef, CakeSlice, Carrot, Coffee, CookingPot, Cookie, Croissant, Drumstick, Dumbbell, Fish, Flame, Heart,
  Layers, Leaf, Link2, MilkOff, Refrigerator, Salad, Sandwich, Smartphone, Soup, Sprout, Star, Timer,
  UtensilsCrossed, Wheat, WheatOff,
  type LucideIcon,
} from 'lucide-react';
import { QUICK_TAG, TAG_GROUPS, groupOfTag, type TagGroupId } from '../../shared/tags';
import { msg, t } from '../i18n';

/**
 * How filters and tags are shown: a plain label and, where one fits, an icon.
 *
 * The values themselves do not change. Filter keys such as '⭐ Favourites' and
 * tags such as 'Quick (<30min)' are what the store filters on and what the AI
 * writes into recipes.tags, so they stay as they are; only what is drawn on
 * screen goes through tagLabel() and <TagIcon>. Emoji in labels are gone: they
 * drew in a different style on every platform and clashed with the icons
 * everywhere else in the app.
 */

const LABELS: Record<string, string> = {
  '⭐ Favourites': msg('Favourites'),
  '🔗 Shared': msg('Shared'),
  '🆕 New from iPhone': msg('New from iPhone'),
  'Quick (<30min)': msg('Under 30 min'),
};

/*
 * The tags and group names of shared/tags.ts, listed again only so that the
 * dictionary test sees them as text to translate (that file is read by the
 * server and stays free of the app's i18n). Stored tag values stay English;
 * tagLabel() translates what is drawn. A tag or group added there needs a line
 * here and a German entry in src/i18n/de/vault.ts.
 */
export const TRANSLATED_TAG_TEXT: readonly string[] = [
  // Groups
  msg('Diet'), msg('Cuisine'), msg('Meal'), msg('Main ingredient'), msg('More'),
  // Diet
  msg('Vegetarian'), msg('Vegan'), msg('Gluten-Free'), msg('Dairy-Free'), msg('High Protein'), msg('Low Carb'),
  // Cuisine
  msg('German'), msg('Italian'), msg('Mediterranean'), msg('Asian'), msg('Indian'), msg('Mexican'), msg('American'),
  // Meal
  msg('Breakfast'), msg('Lunch'), msg('Dinner'), msg('Dessert'), msg('Snack'), msg('Soup'), msg('Salad'), msg('Pasta'), msg('Casserole'),
  // Main ingredient
  msg('Chicken'), msg('Meat'), msg('Fish & Seafood'),
  // More
  msg('One-Pot'), msg('Baking'), msg('Grilling'), msg('Meal Prep'), msg('Comfort Food'),
];

const ICONS: Record<string, LucideIcon> = {
  '⭐ Favourites': Star,
  '🔗 Shared': Link2,
  '🆕 New from iPhone': Smartphone,
  'Quick (<30min)': Timer,
  Vegetarian: Leaf,
  Vegan: Sprout,
  'Gluten-Free': WheatOff,
  'Dairy-Free': MilkOff,
  'High Protein': Dumbbell,
  'Low Carb': Carrot,
  'Comfort Food': Heart,
  Breakfast: Coffee,
  Lunch: Sandwich,
  Dinner: UtensilsCrossed,
  Dessert: CakeSlice,
  Snack: Cookie,
  Soup,
  Salad,
  Pasta: Wheat,
  Casserole: Layers,
  Chicken: Drumstick,
  Meat: Beef,
  'Fish & Seafood': Fish,
  Baking: Croissant,
  Grilling: Flame,
  'One-Pot': CookingPot,
  'Meal Prep': Refrigerator,
};

/**
 * What a filter or tag reads as on screen, in the app's language. A tag the
 * list does not know (an older or hand-typed one) is shown as it is stored.
 */
export function tagLabel(tag: string): string {
  return t(LABELS[tag] ?? tag.replace(/^\p{Extended_Pictographic}️?\s*/u, ''));
}

/**
 * A tag's icon, or nothing: cuisines and anything the AI invents go without.
 * Decorative, since the label says it all.
 */
export function TagIcon({ tag, className }: { tag: string; className?: string }) {
  const icon = ICONS[tag];
  return icon ? createElement(icon, { className, 'aria-hidden': true }) : null;
}

/*
 * Filters in use are a list, and they combine (every tag must be on the
 * recipe). One per tag group, chosen from that group's menu; the direct chips
 * (Favourites, Shared, Under 30 min, New from iPhone) are each a slot of their
 * own, so any of them goes with anything else.
 */

/** Which slot a filter takes: its tag group, or itself for a direct chip. */
export function filterSlot(key: string): string {
  if (key === QUICK_TAG) return key;
  return groupOfTag(key) ?? key;
}

/** Turns a filter on, replacing whatever held its slot, or off if it was on. */
export function toggleFilter(active: readonly string[], key: string): string[] {
  if (active.includes(key)) return active.filter((k) => k !== key);
  const slot = filterSlot(key);
  return [...active.filter((k) => filterSlot(k) !== slot), key];
}

/** The tag chosen in a group's menu, if any. */
export function chosenInGroup(active: readonly string[], group: TagGroupId): string | null {
  return active.find((k) => k !== QUICK_TAG && groupOfTag(k) === group) ?? null;
}

/** Sets (or, with null, clears) a group's choice, leaving every other filter as it was. */
export function setGroupFilter(active: readonly string[], group: TagGroupId, tag: string | null): string[] {
  const rest = active.filter((k) => k === QUICK_TAG || groupOfTag(k) !== group);
  return tag ? [...rest, tag] : rest;
}

/** The groups offered as menus in the vault: every tag but the direct chip. */
export const MENU_GROUPS = TAG_GROUPS.map((g) => ({
  id: g.id as TagGroupId,
  label: g.label,
  tags: (g.tags as readonly string[]).filter((tag) => tag !== QUICK_TAG),
}));

/**
 * The one chip used for every choice in the vault (filters, people,
 * collections): outlined at rest, a soft green fill when chosen. Material's
 * filter chip: 32 px high, 8 px corners, which also sets them apart from the
 * app's round buttons.
 */
export function chipClass(active: boolean, variant: 'default' | 'highlight' = 'default'): string {
  return [
    'inline-flex shrink-0 items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-medium font-sans whitespace-nowrap transition-colors ring-1 ring-inset',
    active
      ? 'bg-sk-primary-fixed/70 text-sk-on-primary-fixed ring-sk-primary/25 dark:bg-primary/20 dark:text-primary dark:ring-primary/30'
      : variant === 'highlight'
        ? 'bg-amber-50 text-amber-900 ring-amber-300/70 hover:bg-amber-100 dark:bg-amber-900/25 dark:text-amber-200 dark:ring-amber-400/25'
        : 'bg-white/60 text-sk-on-surface-variant ring-sk-outline-variant/70 hover:bg-sk-surface-low hover:text-sk-on-surface dark:bg-white/[0.03] dark:text-muted-foreground dark:ring-white/10 dark:hover:bg-white/[0.06] dark:hover:text-foreground',
  ].join(' ');
}

/**
 * A chip that adds something: dashed, quieter. `chip` size beside the vault's
 * chips (a new collection), `tag` size beside a recipe's tags (a tag to add).
 */
export function addChipClass(size: 'chip' | 'tag' = 'chip'): string {
  return [
    'inline-flex shrink-0 items-center gap-1 font-medium font-sans whitespace-nowrap border border-dashed border-sk-outline-variant text-sk-outline hover:border-sk-primary hover:text-sk-primary dark:border-white/15 dark:text-muted-foreground dark:hover:text-primary transition-colors',
    size === 'chip' ? 'h-8 px-3 rounded-lg text-[13px]' : 'h-7 px-2.5 rounded-md text-xs',
  ].join(' ');
}

/**
 * A recipe's tag, on its card and in the recipe: a small green label. Smaller
 * and tonal, so it reads as a description of the recipe rather than as a
 * control, though on a card it does filter by that tag when tapped.
 */
export function tagClass(active = false, size: 'sm' | 'md' = 'sm'): string {
  return [
    'inline-flex items-center gap-1 rounded-md font-medium font-sans whitespace-nowrap transition-colors',
    size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs',
    active
      ? 'bg-sk-primary text-white dark:bg-primary dark:text-primary-foreground'
      : 'bg-sk-primary/[0.08] text-sk-primary dark:bg-primary/[0.12] dark:text-primary',
  ].join(' ');
}
