import { useState } from 'react';
import {
  ShoppingCart, Wand2, X, Package, ArrowLeft, Plus, Minus, Check, Users, RefreshCw,
} from 'lucide-react';
import type { ShoppingItem, PantryItem, MealPlan, Recipe } from '@/types';
import { useT, msg, tn, dateLocale } from '@/i18n';
import { rich } from '@/i18n/rich';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/Sheet';
import { SegmentedTabs, type SegmentedTab } from '@/components/SegmentedTabs';
import {
  MAX_PORTIONS, basketSignature, isOnList, portionsOf, readListBasis, upcomingMeals, writeListBasis,
} from '@/lib/shoppingMeals';

type Tab = 'shopping' | 'pantry';

/** The group for items the person added themselves. */
const OWN_ITEMS = msg('Your items');
/** The group for generated items and pantry items without a category. */
const OTHER = 'Other';

interface Props {
  shoppingList: ShoppingItem[];
  pantryItems: PantryItem[];
  isGenerating: boolean;
  mealPlans: MealPlan[];
  /** Whose list this is; a linked person's planned meals are shown but not changed. */
  userId?: string | null;
  /** Builds the list from the ticked upcoming meals; true when a new list was written. */
  onGenerate: (mealPlans: MealPlan[]) => Promise<boolean>;
  /** Portions of a planned meal, or whether it goes on the list. */
  onUpdateMeal: (id: string, changes: { servings?: number | null; in_shopping?: boolean }) => Promise<boolean>;
  onOpenRecipe?: (recipe: Recipe) => void;
  /** Adds an item the person typed in; Generate keeps these. */
  onAddItem: (item: string) => void;
  onToggleItem: (id: string, checked: boolean) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
  onMoveItemToPantry: (item: ShoppingItem) => void;
  onMoveItemToShopping: (item: PantryItem) => void;
  onDeletePantryItem: (id: string) => void;
  onAddToPantry: (item: string, category: string | null) => void;
}

const CARD = 'rounded-2xl bg-white dark:bg-card ring-1 ring-sk-outline-variant/40 dark:ring-border';
const LABEL = 'font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-sk-on-surface-variant dark:text-muted-foreground';
const FIELD = 'flex-1 min-w-0 h-10 rounded-xl border-0 bg-sk-surface-highest dark:bg-input px-4 text-sm font-sans text-sk-on-surface dark:text-foreground placeholder:text-sk-outline dark:placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sk-primary/25 dark:focus:ring-primary/25';
const ADD = 'inline-flex shrink-0 items-center gap-1.5 h-10 px-4 rounded-full bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground text-sm font-semibold font-sans transition-colors';
const ICON_BUTTON = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sk-outline dark:text-muted-foreground hover:bg-sk-surface-low dark:hover:bg-muted transition-colors';

/** The round tick used for meals and items: empty, or filled green with a check. */
function Tick({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
        checked
          ? 'border-sk-primary bg-sk-primary text-white dark:border-primary dark:bg-primary dark:text-primary-foreground'
          : 'border-sk-outline dark:border-muted-foreground'
      }`}
    >
      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
    </span>
  );
}

/**
 * Shopping: the meals the list is for, the list itself, and the pantry.
 *
 * The list is built from the meals planned for today and the next seven days.
 * They are shown first, as a basket: each can be left off the list and given
 * its own number of portions (migration 0079), and "Create list" uses exactly
 * what is ticked there. It used to take every planned meal silently, at the
 * recipe's own servings, and say nothing about which.
 *
 * The page is drawn with the app's own surfaces, serif headings and round
 * ticks; it was the one screen still in the neutral greys and bold sans of
 * an earlier design. Bought items move into a "Done" group at the bottom.
 */
export function ShoppingList({
  shoppingList, pantryItems, isGenerating, mealPlans, userId,
  onGenerate, onUpdateMeal, onOpenRecipe, onAddItem, onToggleItem, onDeleteItem, onClearAll,
  onMoveItemToPantry, onMoveItemToShopping, onDeletePantryItem, onAddToPantry,
}: Props) {
  const t = useT();
  // The two groups the app names itself are translated; the AI's group names are shown as they came.
  const groupLabel = (cat: string) => (cat === OWN_ITEMS ? t(OWN_ITEMS) : cat === OTHER ? t('Other##shopping group') : cat);
  const [tab, setTab] = useState<Tab>('shopping');
  const [newPantryItem, setNewPantryItem] = useState('');
  const [newItem, setNewItem] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  // What the list on screen was made from, as far as this device knows.
  const [basis, setBasis] = useState(() => readListBasis(userId));

  const meals = upcomingMeals(mealPlans);
  const chosen = meals.filter(isOnList);
  const signature = basketSignature(meals);
  const generatedCount = shoppingList.filter((i) => i.from_plan).length;
  const listIsCurrent = generatedCount > 0 && basis === signature;
  const mealsChanged = generatedCount > 0 && basis !== null && basis !== signature;

  async function generate() {
    const madeFrom = signature;
    if (await onGenerate(mealPlans)) {
      writeListBasis(userId, madeFrom);
      setBasis(madeFrom);
    }
  }

  function clearList() {
    setConfirmClear(false);
    onClearAll();
    writeListBasis(userId, null);
    setBasis(null);
  }

  // Which shopping items the pantry already holds (same text, any case).
  const pantryNames = new Set(pantryItems.map((p) => p.item.toLowerCase()));
  const inPantry = (item: ShoppingItem) => pantryNames.has(item.item.toLowerCase());

  const open = shoppingList.filter((i) => !i.is_checked);
  const done = shoppingList.filter((i) => i.is_checked);
  const grouped = open.reduce((acc, curr) => {
    // What the person added themselves has no category; it gets a group of
    // its own rather than hiding among the generated "Other".
    const cat = curr.category || (curr.from_plan ? OTHER : OWN_ITEMS);
    (acc[cat] ??= []).push(curr);
    return acc;
  }, {} as Record<string, ShoppingItem[]>);
  // The person's own items first, then the generated groups as they came.
  const groups = Object.entries(grouped).sort(([a], [b]) => Number(b === OWN_ITEMS) - Number(a === OWN_ITEMS));

  const pantryGrouped = pantryItems.reduce((acc, curr) => {
    (acc[curr.category || OTHER] ??= []).push(curr);
    return acc;
  }, {} as Record<string, PantryItem[]>);

  const pantryOverlapCount = open.filter(inPantry).length;
  const pantryOverlapText = pantryOverlapCount === 1
    ? msg('<b>{n} item</b> on this list is already in your pantry — shown with a green dot.')
    : msg('<b>{n} items</b> on this list are already in your pantry — shown with a green dot.');

  const TABS: SegmentedTab<Tab>[] = [
    { id: 'shopping', label: t('To Buy'), icon: ShoppingCart, count: open.length || undefined },
    { id: 'pantry', label: t('Pantry'), icon: Package, count: pantryItems.length || undefined },
  ];

  const dayOf = (meal: MealPlan) =>
    new Date(`${meal.date}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });

  const itemRow = (item: ShoppingItem) => (
    <li key={item.id} className="flex items-center gap-1 pl-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.is_checked}
        onClick={() => onToggleItem(item.id, !item.is_checked)}
        data-pressable="surface"
        className="flex flex-1 min-w-0 items-center gap-3 min-h-11 px-2 rounded-xl text-left hover:bg-sk-surface-low dark:hover:bg-muted transition-colors"
      >
        <Tick checked={item.is_checked} />
        <span className={`min-w-0 text-sm font-sans ${item.is_checked ? 'line-through text-sk-outline dark:text-muted-foreground' : 'text-sk-on-surface dark:text-foreground'}`}>
          {!item.is_checked && inPantry(item) && (
            <span className="inline-block w-2 h-2 rounded-full bg-sk-primary dark:bg-primary mr-1.5 mb-0.5" title={t('Already in pantry')} />
          )}
          {item.item}
        </span>
      </button>
      {!item.is_checked && (
        <button type="button" onClick={() => onMoveItemToPantry(item)} className={`${ICON_BUTTON} hover:text-sk-primary dark:hover:text-primary`} title={t('Move to pantry')} aria-label={t('Move {item} to the pantry', { item: item.item })}>
          <Package className="w-4 h-4" />
        </button>
      )}
      <button type="button" onClick={() => onDeleteItem(item.id)} className={`${ICON_BUTTON} hover:text-destructive`} aria-label={t('Remove {item}', { item: item.item })}>
        <X className="w-4 h-4" />
      </button>
    </li>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-in fade-in duration-500">
      <h2 className="font-serif text-2xl sm:text-3xl font-normal text-sk-on-surface dark:text-foreground">
        {t('Smart Shopping List')}
      </h2>

      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label={t('Shopping list and pantry')} idPrefix="shopping" layout="fill" />

      {tab === 'shopping' && (
        <div id="shopping-panel" role="tabpanel" aria-labelledby="shopping-tab-shopping" className="space-y-5">
          {/* ── The meals this list is for ─────────────────────────────── */}
          <section aria-label={t('Meals for this list')} className={`${CARD} p-4 sm:p-5`}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className={LABEL}>{t('Meals for this list')}</h3>
              {meals.length > 0 && (
                <span className="text-xs font-sans text-sk-on-surface-variant dark:text-muted-foreground tabular-nums">
                  {t('{chosen} of {total} chosen', { chosen: chosen.length, total: meals.length })}
                </span>
              )}
            </div>

            {meals.length === 0 ? (
              <p className="mt-3 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                {t('Nothing is planned for today or the next 7 days. Plan a meal and it appears here.')}
                {generatedCount > 0 && <> {t('This list was generated from a previous meal plan and may no longer be accurate.')}</>}
              </p>
            ) : (
              <>
                <ul className="mt-2 -mx-2">
                  {meals.map((meal) => {
                    const on = isOnList(meal);
                    const portions = portionsOf(meal);
                    const title = meal.recipe?.title ?? t('A recipe that is gone');
                    // Someone else's plan entry (a connected account): shown, since
                    // it is planned, but only its owner can change it.
                    const own = !meal.user_id || !userId || meal.user_id === userId;
                    return (
                      <li key={meal.id} className={`flex items-center gap-1 ${on ? '' : 'opacity-55'}`}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={t('{title} on the list', { title })}
                          disabled={!own}
                          onClick={() => void onUpdateMeal(meal.id, { in_shopping: !on })}
                          data-pressable="surface"
                          className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-sk-surface-low dark:hover:bg-muted transition-colors disabled:pointer-events-none"
                        >
                          <Tick checked={on} />
                        </button>
                        <button
                          type="button"
                          disabled={!meal.recipe || !onOpenRecipe}
                          onClick={() => meal.recipe && onOpenRecipe?.(meal.recipe)}
                          data-pressable="surface"
                          className="flex-1 min-w-0 py-1.5 text-left"
                        >
                          <span className="block font-serif text-base leading-snug text-sk-on-surface dark:text-foreground truncate">{title}</span>
                          <span className="block text-xs font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                            {dayOf(meal)} · {t(meal.meal_type)}
                          </span>
                        </button>
                        {/* Portions: − n +. The number is what the amounts on the list are scaled to. */}
                        <div role="group" aria-label={t('Portions of {title}', { title })} className="flex shrink-0 items-center">
                          <button
                            type="button"
                            disabled={!own || !on || portions <= 1}
                            onClick={() => void onUpdateMeal(meal.id, { servings: portions - 1 })}
                            aria-label={t('One portion fewer')}
                            className={`${ICON_BUTTON} disabled:opacity-30 disabled:pointer-events-none`}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="inline-flex min-w-9 items-center justify-center gap-1 text-sm font-semibold font-sans tabular-nums text-sk-primary dark:text-primary" title={tn(portions, '{n} portion', '{n} portions')}>
                            <Users className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
                            <span aria-label={tn(portions, '{n} portion', '{n} portions')}>{portions}</span>
                          </span>
                          <button
                            type="button"
                            disabled={!own || !on || portions >= MAX_PORTIONS}
                            onClick={() => void onUpdateMeal(meal.id, { servings: portions + 1 })}
                            aria-label={t('One portion more')}
                            className={`${ICON_BUTTON} disabled:opacity-30 disabled:pointer-events-none`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-3 pt-3 border-t border-sk-outline-variant/40 dark:border-border flex flex-col sm:flex-row sm:items-center gap-3">
                  <p role="status" className="flex-1 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                    {chosen.length === 0
                      ? t('Tick at least one meal to make a list from it.')
                      : mealsChanged
                        ? t('The meals have changed since the list was made.')
                        : listIsCurrent
                          ? t('The list matches these meals.')
                          : generatedCount > 0
                            ? t('Update the list to match these meals.')
                            : t('Amounts are added up across the meals and sorted by aisle.')}
                  </p>
                  <Button
                    type="button"
                    onClick={generate}
                    disabled={isGenerating || chosen.length === 0}
                    variant={listIsCurrent ? 'outline' : 'default'}
                    className={`h-10 shrink-0 rounded-full px-5 gap-2 ${listIsCurrent ? '' : 'bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0'}`}
                  >
                    {listIsCurrent ? <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} /> : <Wand2 className={`w-4 h-4 ${isGenerating ? 'animate-pulse' : ''}`} />}
                    {isGenerating ? t('Generating...') : generatedCount > 0 ? t('Update list') : t('Create list')}
                  </Button>
                </div>
              </>
            )}
          </section>

          {/* ── Add an item by hand ────────────────────────────────────── */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = newItem.trim();
              if (!val) return;
              onAddItem(val);
              setNewItem('');
            }}
            className="flex gap-2"
          >
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              aria-label={t('Add an item to the shopping list')}
              placeholder={t('Add an item (e.g. coffee, washing-up liquid)…')}
              maxLength={200}
              enterKeyHint="done"
              className={FIELD}
            />
            {/* A round + on a phone, so the field keeps the row; named from sm. */}
            <button type="submit" aria-label={t('Add')} className={`${ADD} max-sm:w-10 max-sm:px-0 max-sm:justify-center`}>
              <Plus className="w-4 h-4" /> <span className="max-sm:hidden">{t('Add')}</span>
            </button>
          </form>

          {pantryOverlapCount > 0 && (
            <p className="flex items-start gap-2.5 px-1 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
              <Package className="w-4 h-4 shrink-0 mt-0.5 text-sk-primary dark:text-primary" aria-hidden="true" />
              <span>{rich(t, pantryOverlapText, { b: (text) => <span className="font-semibold text-sk-on-surface dark:text-foreground">{text}</span> }, { n: pantryOverlapCount })}</span>
            </p>
          )}

          {/* ── The list ───────────────────────────────────────────────── */}
          {shoppingList.length === 0 ? (
            <div className={`${CARD} text-center px-6 py-14`}>
              <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-sk-primary-fixed dark:text-muted" aria-hidden="true" />
              <p className="font-serif text-xl font-normal text-sk-on-surface dark:text-foreground">{t('Your shopping list is empty.')}</p>
              <p className="mt-1 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">{t('Generate one from your meal plan, or add items above.')}</p>
            </div>
          ) : (
            <>
              {groups.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groups.map(([cat, items]) => (
                    <section key={cat} className={`${CARD} p-3 pt-4`}>
                      <h3 className={`${LABEL} px-3 mb-1`}>{groupLabel(cat)}</h3>
                      <ul>{items.map(itemRow)}</ul>
                    </section>
                  ))}
                </div>
              )}

              {open.length === 0 && (
                <p className="text-center font-serif text-lg text-sk-on-surface dark:text-foreground py-2">{t('Everything is in the basket.')}</p>
              )}

              {done.length > 0 && (
                <section className={`${CARD} p-3 pt-4 bg-sk-surface-low dark:bg-card`}>
                  <div className="flex items-center justify-between gap-3 px-3 mb-1">
                    <h3 className={LABEL}>{t('Done##shopping')} · {done.length}</h3>
                    <button
                      type="button"
                      onClick={() => done.forEach((i) => onDeleteItem(i.id))}
                      className="text-xs font-semibold font-sans text-sk-primary dark:text-primary hover:underline"
                    >
                      {t('Remove done items')}
                    </button>
                  </div>
                  <ul>{done.map(itemRow)}</ul>
                </section>
              )}

              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  title={t('Clear shopping list')}
                  className="text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground hover:text-destructive transition-colors"
                >
                  {t('Clear the whole list')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'pantry' && (
        <div id="shopping-panel" role="tabpanel" aria-labelledby="shopping-tab-pantry" className="space-y-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = newPantryItem.trim();
              if (!val) return;
              onAddToPantry(val, null);
              setNewPantryItem('');
            }}
            className="flex gap-2"
          >
            <input
              value={newPantryItem}
              onChange={(e) => setNewPantryItem(e.target.value)}
              aria-label={t('Add an item to the pantry')}
              placeholder={t('Add a pantry item (e.g. olive oil, pasta)…')}
              maxLength={200}
              enterKeyHint="done"
              className={FIELD}
            />
            {/* A round + on a phone, so the field keeps the row; named from sm. */}
            <button type="submit" aria-label={t('Add')} className={`${ADD} max-sm:w-10 max-sm:px-0 max-sm:justify-center`}>
              <Plus className="w-4 h-4" /> <span className="max-sm:hidden">{t('Add')}</span>
            </button>
          </form>

          {pantryItems.length === 0 ? (
            <div className={`${CARD} text-center px-6 py-14`}>
              <Package className="w-12 h-12 mx-auto mb-4 text-sk-primary-fixed dark:text-muted" aria-hidden="true" />
              <p className="font-serif text-xl font-normal text-sk-on-surface dark:text-foreground">{t('Your pantry is empty.')}</p>
              <p className="mt-1 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">{t("Add items you always have at home. They'll show on your shopping list with a green dot when needed.")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(pantryGrouped).map(([cat, items]) => (
                <section key={cat} className={`${CARD} p-3 pt-4`}>
                  <h3 className={`${LABEL} px-3 mb-1`}>{groupLabel(cat)}</h3>
                  <ul>
                    {items.map((item) => (
                      <li key={item.id} className="flex items-center gap-1 pl-3 min-h-11">
                        <span className="inline-block w-2 h-2 shrink-0 rounded-full bg-sk-primary dark:bg-primary" aria-hidden="true" />
                        <span className="flex-1 min-w-0 pl-2 text-sm font-sans text-sk-on-surface dark:text-foreground">{item.item}</span>
                        <button type="button" onClick={() => onMoveItemToShopping(item)} className={`${ICON_BUTTON} hover:text-sk-primary dark:hover:text-primary`} title={t('Move to shopping list')} aria-label={t('Move {item} to the shopping list', { item: item.item })}>
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => onDeletePantryItem(item.id)} className={`${ICON_BUTTON} hover:text-destructive`} aria-label={t('Remove {item}', { item: item.item })}>
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      <Sheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title={t('Clear the whole list?')}
        description={tn(shoppingList.length, 'Removes the {n} item on it, also one you added yourself. The pantry stays.', 'Removes all {n} items on it, also the ones you added yourself. The pantry stays.')}
      >
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirmClear(false)} className="flex-1 rounded-full">{t('Keep it')}</Button>
          <Button type="button" onClick={clearList} className="flex-1 rounded-full bg-destructive hover:bg-destructive/90 text-white border-0">{t('Clear##shopping list')}</Button>
        </div>
      </Sheet>
    </div>
  );
}
