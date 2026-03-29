import { ShoppingCart, Wand2, X, AlertTriangle } from 'lucide-react';
import type { ShoppingItem, MealPlan } from '@/types';

interface Props {
  shoppingList: ShoppingItem[];
  isGenerating: boolean;
  mealPlans: MealPlan[];
  onGenerate: (mealPlans: MealPlan[]) => void;
  onToggleItem: (id: string, checked: boolean) => void;
  onDeleteItem: (id: string) => void;
}

export function ShoppingList({ shoppingList, isGenerating, mealPlans, onGenerate, onToggleItem, onDeleteItem }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const hasUpcomingMeals = mealPlans.some((m) => {
    const d = new Date(m.date);
    return d >= today && d <= nextWeek;
  });
  const isStale = shoppingList.length > 0 && !hasUpcomingMeals;

  const grouped = shoppingList.reduce(
    (acc, curr) => {
      const cat = curr.category || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(curr);
      return acc;
    },
    {} as Record<string, ShoppingItem[]>,
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
          <ShoppingCart className="w-6 h-6 text-orange-500" /> Smart Shopping List
        </h2>
        <button
          onClick={() => onGenerate(mealPlans)}
          disabled={isGenerating}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold min-h-[40px] px-4 rounded-xl shadow-sm transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Wand2 className="w-4 h-4" />
          {isGenerating ? 'Generating...' : 'Generate from Next 7 Days'}
        </button>
      </div>

      {isStale && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-800 dark:text-amber-300">No meals planned for the next 7 days.</span>
            <span className="text-amber-700 dark:text-amber-400"> This list was generated from a previous meal plan and may no longer be accurate. Plan your meals and regenerate to update it.</span>
          </div>
        </div>
      )}

      {shoppingList.length === 0 ? (
        <div className="text-center py-24 bg-white dark:bg-zinc-900/50 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
          <ShoppingCart className="w-16 h-16 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
          <p className="text-xl font-bold text-zinc-500 dark:text-zinc-400">Your shopping list is empty.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="bg-white dark:bg-zinc-900/50 p-5 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
              <h3 className="font-bold text-lg text-orange-600 dark:text-orange-400 mb-3 ml-2">{cat}</h3>
              <div className="space-y-1">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl group transition-colors">
                    <input
                      type="checkbox"
                      checked={item.is_checked}
                      onChange={(e) => onToggleItem(item.id, e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded border border-zinc-300 dark:border-zinc-600 text-orange-500 focus:ring-orange-500 cursor-pointer bg-white dark:bg-zinc-800"
                    />
                    <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}>
                      {item.item}
                    </span>
                    <button
                      onClick={() => onDeleteItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
