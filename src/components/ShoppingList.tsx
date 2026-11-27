import { useState } from 'react';
import { ShoppingCart, Wand2, X, AlertTriangle, Trash2, Package, ArrowLeft, Plus } from 'lucide-react';
import type { ShoppingItem, PantryItem, MealPlan } from '@/types';
import { useT, msg } from '@/i18n';
import { rich } from '@/i18n/rich';

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
  onGenerate: (mealPlans: MealPlan[]) => void;
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

export function ShoppingList({
  shoppingList, pantryItems, isGenerating, mealPlans,
  onGenerate, onAddItem, onToggleItem, onDeleteItem, onClearAll,
  onMoveItemToPantry, onMoveItemToShopping, onDeletePantryItem, onAddToPantry,
}: Props) {
  const t = useT();
  // The two groups the app names itself are translated; the AI's group names are shown as they came.
  const groupLabel = (cat: string) => (cat === OWN_ITEMS ? t(OWN_ITEMS) : cat === OTHER ? t('Other##shopping group') : cat);
  const [tab, setTab] = useState<Tab>('shopping');
  const [newPantryItem, setNewPantryItem] = useState('');
  const [newItem, setNewItem] = useState('');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const hasUpcomingMeals = mealPlans.some((m) => {
    const d = new Date(m.date);
    return d >= today && d <= nextWeek;
  });
  const isStale = shoppingList.length > 0 && !hasUpcomingMeals;

  // Which shopping items are already covered by pantry (case-insensitive substring match)
  const pantryNames = new Set(pantryItems.map((p) => p.item.toLowerCase()));
  function isPantryItem(item: ShoppingItem) {
    return pantryNames.has(item.item.toLowerCase());
  }

  const shoppingGrouped = shoppingList.reduce((acc, curr) => {
    // What the person added themselves has no category; it gets a group of
    // its own rather than hiding among the generated "Other".
    const cat = curr.category || (curr.from_plan ? OTHER : OWN_ITEMS);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(curr);
    return acc;
  }, {} as Record<string, ShoppingItem[]>);
  // The person's own items first, then the generated groups as they came.
  const shoppingGroups = Object.entries(shoppingGrouped).sort(([a], [b]) => Number(b === OWN_ITEMS) - Number(a === OWN_ITEMS));

  const pantryGrouped = pantryItems.reduce((acc, curr) => {
    const cat = curr.category || OTHER;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(curr);
    return acc;
  }, {} as Record<string, PantryItem[]>);

  const pantryOverlapCount = shoppingList.filter(isPantryItem).length;
  const pantryOverlapText = pantryOverlapCount === 1
    ? msg('<b>{n} item</b> on this list is already in your pantry — shown with a green dot.')
    : msg('<b>{n} items</b> on this list are already in your pantry — shown with a green dot.');

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
          <ShoppingCart className="w-6 h-6 text-sk-primary" /> {t('Smart Shopping List')}
        </h2>
        <div className="flex gap-2">
          {shoppingList.length > 0 && tab === 'shopping' && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-2 bg-zinc-100 hover:bg-red-50 dark:bg-zinc-800 dark:hover:bg-red-900/30 text-zinc-500 hover:text-red-600 dark:hover:text-red-400 text-sm font-bold min-h-[40px] px-4 rounded-xl transition-colors border border-zinc-200 dark:border-zinc-700"
              title={t('Clear shopping list')}
            >
              <Trash2 className="w-4 h-4" /> {t('Clear')}
            </button>
          )}
          <button
            onClick={() => onGenerate(mealPlans)}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold min-h-[40px] px-4 rounded-xl shadow-sm transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Wand2 className="w-4 h-4" />
            {isGenerating ? t('Generating...') : <><span className="hidden sm:inline">{t('Generate from Next 7 Days')}</span><span className="sm:hidden">{t('Generate')}</span></>}
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 gap-1">
        <button
          onClick={() => setTab('shopping')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'shopping' ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
        >
          <ShoppingCart className="w-4 h-4" />
          {t('To Buy')}
          {shoppingList.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-sk-primary text-white dark:text-primary-foreground text-[10px] font-bold rounded-full">{shoppingList.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('pantry')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'pantry' ? 'bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
        >
          <Package className="w-4 h-4" />
          {t('Pantry')}
          {pantryItems.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-emerald-700 text-white text-[10px] font-bold rounded-full">{pantryItems.length}</span>
          )}
        </button>
      </div>

      {/* Stale warning */}
      {isStale && tab === 'shopping' && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-800 dark:text-amber-300">{t('No meals planned for the next 7 days.')}</span>
            <span className="text-amber-700 dark:text-amber-400">{' '}{t('This list was generated from a previous meal plan and may no longer be accurate.')}</span>
          </div>
        </div>
      )}

      {/* Pantry overlap banner */}
      {pantryOverlapCount > 0 && tab === 'shopping' && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl text-sm">
          <Package className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <span className="text-emerald-700 dark:text-emerald-400">
            {rich(t, pantryOverlapText, { b: (text) => <span className="font-semibold">{text}</span> }, { n: pantryOverlapCount })}
          </span>
        </div>
      )}

      {/* Add an item by hand */}
      {tab === 'shopping' && (
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
            className="flex-1 min-w-0 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sk-primary/40"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> {t('Add')}
          </button>
        </form>
      )}

      {/* SHOPPING TAB */}
      {tab === 'shopping' && (
        shoppingList.length === 0 ? (
          <div className="text-center py-24 bg-white dark:bg-zinc-900/50 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
            <ShoppingCart className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
            <p className="text-xl font-bold text-zinc-500 dark:text-zinc-400">{t('Your shopping list is empty.')}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">{t('Generate one from your meal plan, or add items above.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {shoppingGroups.map(([cat, items]) => (
              <div key={cat} className="bg-white dark:bg-zinc-900/50 p-5 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
                <h3 className="font-sans font-semibold text-sm uppercase tracking-widest text-sk-primary dark:text-primary mb-3 ml-2">{groupLabel(cat)}</h3>
                <div className="space-y-1">
                  {items.map((item) => {
                    const inPantry = isPantryItem(item);
                    return (
                      <div key={item.id} className="flex items-start gap-3 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl group transition-colors">
                        <input
                          type="checkbox"
                          checked={item.is_checked}
                          onChange={(e) => onToggleItem(item.id, e.target.checked)}
                          className="w-5 h-5 mt-0.5 rounded border border-sk-outline-variant dark:border-border text-sk-primary focus:ring-sk-primary/30 cursor-pointer bg-white dark:bg-card"
                        />
                        <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}>
                          {inPantry && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5 mb-0.5" title={t('Already in pantry')} />}
                          {item.item}
                        </span>
                        <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onMoveItemToPantry(item)}
                            className="text-emerald-500 hover:text-emerald-700 p-1"
                            title={t('Move to pantry')}
                          >
                            <Package className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteItem(item.id)}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* PANTRY TAB */}
      {tab === 'pantry' && (
        <div className="space-y-6">
          {/* Add pantry item form */}
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
              placeholder={t('Add a pantry item (e.g. olive oil, pasta)…')}
              className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" /> {t('Add')}
            </button>
          </form>

          {pantryItems.length === 0 ? (
            <div className="text-center py-24 bg-white dark:bg-zinc-900/50 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
              <Package className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
              <p className="text-xl font-bold text-zinc-500 dark:text-zinc-400">{t('Your pantry is empty.')}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">{t("Add items you always have at home. They'll show on your shopping list with a green dot when needed.")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(pantryGrouped).map(([cat, items]) => (
                <div key={cat} className="bg-white dark:bg-zinc-900/50 p-5 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
                  <h3 className="font-bold text-lg text-emerald-600 dark:text-emerald-400 mb-3 ml-2">{groupLabel(cat)}</h3>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl group transition-colors">
                        <Package className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                        <span className="flex-1 text-sm text-zinc-800 dark:text-zinc-200">{item.item}</span>
                        <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onMoveItemToShopping(item)}
                            className="text-sk-outline hover:text-sk-primary p-1"
                            title={t('Move to shopping list')}
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeletePantryItem(item.id)}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
