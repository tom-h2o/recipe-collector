import { useState } from 'react';
import { ChefHat, Users, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Recipe, MealPlan, RecipeTranslation } from '@/types';
import { MEAL_TYPES } from '@/lib/constants';

interface Props {
  recipes: Recipe[];
  mealPlans: MealPlan[];
  translationsCache?: Record<string, RecipeTranslation>;
  onAddMealPlan: (date: string, mealType: string, recipeId: string) => Promise<void>;
  onRemoveMealPlan: (id: string) => Promise<void>;
  onRefreshMealPlans: () => void;
  onOpenRecipe: (r: Recipe) => void;
}

export function MealPlanner({ recipes, mealPlans, translationsCache, onAddMealPlan, onRemoveMealPlan, onRefreshMealPlans, onOpenRecipe }: Props) {
  function getTitle(r: Recipe): string {
    if (r.preferred_language) {
      const t = translationsCache?.[`${r.id}:${r.preferred_language}`];
      if (t?.title) return t.title;
    }
    return r.title;
  }
  // Track exactly which cell is being dragged over — CSS :hover is suppressed during drag
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  // Mobile: tap-to-add — track which cell is picking a recipe
  const [addingCell, setAddingCell] = useState<{ date: string; meal: string } | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().split('T')[0], label: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }), isToday: i === 0 };
  });

  function getDayCalories(date: string): number {
    return mealPlans
      .filter((m) => m.date === date && m.recipe?.nutrition)
      .reduce((sum, m) => sum + (m.recipe?.nutrition?.calories ?? 0), 0);
  }

  async function handleTapAdd(date: string, meal: string, recipeId: string) {
    try {
      await onAddMealPlan(date, meal, recipeId);
      onRefreshMealPlans();
      setAddingCell(null);
    } catch {
      toast.error('Failed to add meal plan.');
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 animate-in fade-in duration-500">
      {/* Recipe sidebar — collapsible on mobile */}
      <div className="w-full lg:w-1/3 xl:w-1/4 space-y-4 hidden lg:block">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-sk-primary" /> Draggable Recipes
        </h2>
        {recipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <ChefHat className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">No recipes yet</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">Add a recipe to start planning</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2 pb-4">
            {recipes.map((r) => (
              <div
                key={r.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('recipe_id', r.id); e.dataTransfer.effectAllowed = 'copy'; }}
                className="p-3 bg-white dark:bg-card rounded-xl shadow-ambient border-ghost cursor-grab active:cursor-grabbing hover:border-sk-primary/40 transition-colors flex gap-3"
              >
                {r.image_url ? (
                  <img src={r.image_url} className="w-12 h-12 rounded-lg object-cover shrink-0 bg-zinc-100 dark:bg-zinc-800" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-12 h-12 rounded-lg shrink-0 bg-sk-primary-fixed dark:bg-primary/15 flex items-center justify-center text-lg font-serif font-bold text-sk-primary dark:text-primary">
                    {getTitle(r)[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col justify-center overflow-hidden">
                  <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200 truncate">{getTitle(r)}</span>
                  <span className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                    <Users className="w-3 h-3" /> {r.servings || '-'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-4">
        {days.map(({ date, label, isToday }) => {
          const dayCalories = getDayCalories(date);
          return (
            <div key={date} className="bg-white dark:bg-zinc-900/50 p-3 sm:p-5 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-serif font-bold text-base sm:text-lg ${isToday ? 'text-sk-primary dark:text-primary' : 'text-sk-on-surface dark:text-foreground'}`}>
                  {label} {isToday && '(Today)'}
                </h3>
                {dayCalories > 0 && (
                  <span className="text-xs font-bold px-2.5 py-1 bg-sk-primary-fixed/40 dark:bg-primary/15 text-sk-primary dark:text-primary rounded-full">
                    ~{Math.round(dayCalories)} kcal
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                {MEAL_TYPES.map((meal) => {
                  const cellKey = `${date}-${meal}`;
                  const isOver = dragOverKey === cellKey;
                  const isAdding = addingCell?.date === date && addingCell?.meal === meal;
                  return (
                    <div
                      key={meal}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setDragOverKey(cellKey);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverKey(null);
                        }
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setDragOverKey(null);
                        const recipeId = e.dataTransfer.getData('recipe_id');
                        if (recipeId) {
                          try {
                            await onAddMealPlan(date, meal, recipeId);
                            onRefreshMealPlans();
                          } catch {
                            toast.error('Failed to add meal plan.');
                          }
                        }
                      }}
                      className={`min-h-[70px] sm:min-h-[80px] border-2 border-dashed rounded-xl p-2 sm:p-2.5 transition-colors flex flex-col ${
                        isOver
                          ? 'border-sk-primary dark:border-primary bg-sk-primary-fixed/20 dark:bg-primary/10'
                          : 'border-sk-outline-variant/40 dark:border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                        <div className="font-bold text-[10px] sm:text-xs uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{meal}</div>
                        {/* Mobile tap-to-add button */}
                        <button
                          onClick={() => setAddingCell(isAdding ? null : { date, meal })}
                          className="lg:hidden p-0.5 rounded text-sk-outline-variant dark:text-muted-foreground/50 hover:text-sk-primary dark:hover:text-primary transition-colors"
                          title="Add recipe"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Mobile recipe picker */}
                      {isAdding && recipes.length > 0 && (
                        <div className="mb-2 max-h-32 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm lg:hidden">
                          {recipes.map((r) => (
                            <button
                              key={r.id}
                              onClick={() => handleTapAdd(date, meal, r.id)}
                              className="w-full text-left px-2 py-1.5 text-xs font-medium text-sk-on-surface-variant dark:text-muted-foreground hover:bg-sk-primary-fixed/30 dark:hover:bg-primary/10 transition-colors truncate border-b last:border-0 border-sk-outline-variant/20 dark:border-border"
                            >
                              {getTitle(r)}
                            </button>
                          ))}
                        </div>
                      )}
                      {mealPlans.filter((m) => m.date === date && m.meal_type === meal).map((m) => (
                        <div key={m.id} className="bg-sk-primary-fixed/40 dark:bg-primary/15 text-sk-on-surface dark:text-foreground p-1.5 sm:p-2 rounded-lg mt-1 sm:mt-1.5 flex justify-between items-center group shadow-ambient text-xs sm:text-sm">
                          <span
                            className="truncate font-semibold cursor-pointer py-0.5"
                            onClick={() => m.recipe && onOpenRecipe(m.recipe)}
                            title={m.recipe ? getTitle(m.recipe) : undefined}
                          >
                            {m.recipe ? getTitle(m.recipe) : undefined}
                          </span>
                          <button
                            onClick={async () => {
                              try {
                                await onRemoveMealPlan(m.id);
                              } catch {
                                toast.error('Failed to remove meal.');
                              }
                            }}
                            className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 p-1 rounded-md transition-all shrink-0 ml-1 sm:ml-2"
                            title="Remove"
                          >
                            <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
