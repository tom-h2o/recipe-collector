import { useState } from 'react';
import { ChefHat, Users, Minus, Plus, Star, Share2, Printer, Flame, Pencil, Trash2, Clock, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parseIngredients, scaleAmount } from '@/lib/recipeUtils';
import { MEAL_TYPES } from '@/lib/constants';
import type { Recipe } from '@/types';

interface Props {
  recipe: Recipe | null;
  onClose: () => void;
  onEdit: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
  onCook: () => void;
  onUpdateRecipe: (id: string, changes: Partial<Recipe>) => void;
  onAddMealPlan?: (date: string, mealType: string, recipeId: string) => Promise<void>;
}

export function RecipeDetail({ recipe, onClose, onEdit, onDelete, onCook, onUpdateRecipe, onAddMealPlan }: Props) {
  const [scaledServings, setScaledServings] = useState(recipe?.servings || 1);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [planMeal, setPlanMeal] = useState<string>(MEAL_TYPES[2]);
  const [isAddingToPlan, setIsAddingToPlan] = useState(false);

  const planDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      value: d.toISOString().split('T')[0],
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    };
  });
  const [planDate, setPlanDate] = useState(planDates[0].value);

  if (!recipe) return null;


  const baseServings = recipe.servings || 1;
  const scale = scaledServings / baseServings;
  const parsed = parseIngredients(recipe.ingredients);
  const steps = recipe.instructions.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const totalTime = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);

  async function handleAddToPlan() {
    if (!onAddMealPlan || !recipe) return;
    setIsAddingToPlan(true);
    try {
      await onAddMealPlan(planDate, planMeal, recipe.id);
      toast.success(`Added to ${planMeal} on ${planDates.find((d) => d.value === planDate)?.label}`);
      setShowAddPlan(false);
    } catch {
      toast.error('Failed to add to meal plan.');
    } finally {
      setIsAddingToPlan(false);
    }
  }

  return (
    <Dialog open={!!recipe} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[780px] max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-0">
        <div className="flex flex-col">
          {recipe.image_url && (
            <div className="w-full h-60 sm:h-80 overflow-hidden shrink-0 rounded-t-3xl">
              <img src={recipe.image_url} className="w-full h-full object-cover" alt={recipe.title} />
            </div>
          )}
          <div className="p-6 sm:p-10 space-y-8">
            <DialogHeader className="text-left space-y-2">
              <div className="flex items-start justify-between gap-4">
                <DialogTitle className="text-3xl md:text-4xl font-extrabold tracking-tight">
                  {recipe.title}
                </DialogTitle>
                <div className="flex items-center gap-1 shrink-0 pt-1">
                  <button
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/recipe/${recipe.id}`); toast.success('Shared recipe link copied!'); }}
                    className="p-2 rounded-full text-zinc-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                    title="Share recipe"
                  ><Share2 className="w-4 h-4" /></button>
                  <button
                    onClick={() => window.print()}
                    className="p-2 rounded-full text-zinc-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                    title="Print recipe"
                  ><Printer className="w-4 h-4" /></button>
                  {onAddMealPlan && (
                    <button
                      onClick={() => setShowAddPlan((v) => !v)}
                      className={`p-2 rounded-full transition-colors ${showAddPlan ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                      title="Add to meal plan"
                    ><CalendarPlus className="w-4 h-4" /></button>
                  )}
                  <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1" />
                  <button
                    onClick={onCook}
                    className="p-2 rounded-full text-zinc-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                    title="Cook Mode"
                  ><Flame className="w-4 h-4" /></button>
                  <button
                    onClick={() => { onClose(); onEdit(recipe); }}
                    className="p-2 rounded-full text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    title="Edit recipe"
                  ><Pencil className="w-4 h-4" /></button>
                  <button
                    onClick={() => onDelete(recipe)}
                    className="p-2 rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Delete recipe"
                  ><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap pt-1">
                {recipe.servings && (
                  <div className="inline-flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-full px-3 py-1.5">
                    <Users className="w-4 h-4 text-orange-500" />
                    <button
                      onClick={() => setScaledServings((s) => Math.max(1, s - 1))}
                      className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 hover:bg-orange-200 flex items-center justify-center font-bold transition-colors"
                    ><Minus className="w-3 h-3" /></button>
                    <span className="text-sm font-bold text-orange-600 dark:text-orange-400 min-w-[1.5rem] text-center">{scaledServings}</span>
                    <button
                      onClick={() => setScaledServings((s) => s + 1)}
                      className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 hover:bg-orange-200 flex items-center justify-center font-bold transition-colors"
                    ><Plus className="w-3 h-3" /></button>
                    <span className="text-xs font-semibold text-orange-500 ml-1">
                      {scaledServings === recipe.servings ? 'servings' : `servings (base: ${recipe.servings})`}
                    </span>
                  </div>
                )}
                {totalTime > 0 && (
                  <div className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                    <Clock className="w-4 h-4" />
                    {recipe.prep_time_mins != null && recipe.prep_time_mins > 0 && (
                      <span>Prep {recipe.prep_time_mins}m</span>
                    )}
                    {recipe.prep_time_mins != null && recipe.prep_time_mins > 0 && recipe.cook_time_mins != null && recipe.cook_time_mins > 0 && (
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                    )}
                    {recipe.cook_time_mins != null && recipe.cook_time_mins > 0 && (
                      <span>Cook {recipe.cook_time_mins}m</span>
                    )}
                  </div>
                )}
                <span className="text-sm text-zinc-400 font-medium">{parsed.length} ingredients</span>
              </div>

              {recipe.description && (
                <DialogDescription className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed pt-1">
                  {recipe.description}
                </DialogDescription>
              )}

              {/* Add to plan form */}
              {showAddPlan && onAddMealPlan && (
                <div className="mt-2 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-2xl space-y-3">
                  <p className="text-sm font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5"><CalendarPlus className="w-4 h-4" /> Add to meal plan</p>
                  <div className="flex gap-2 flex-wrap">
                    <select
                      value={planDate}
                      onChange={(e) => setPlanDate(e.target.value)}
                      className="flex-1 min-w-[120px] text-sm rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400/60"
                    >
                      {planDates.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                    <select
                      value={planMeal}
                      onChange={(e) => setPlanMeal(e.target.value)}
                      className="flex-1 min-w-[100px] text-sm rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400/60"
                    >
                      {MEAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button
                      onClick={handleAddToPlan}
                      disabled={isAddingToPlan}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                    >
                      {isAddingToPlan ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
              <div className="md:col-span-2">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-orange-500" /> Ingredients
                </h3>
                <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {parsed.map((ing, i) => (
                        <tr key={i} className={`${i % 2 === 0 ? 'bg-zinc-50 dark:bg-zinc-900' : 'bg-white dark:bg-zinc-900/50'} border-b border-zinc-100 dark:border-zinc-800 last:border-0`}>
                          <td className="py-2.5 px-4 font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap w-1/3">
                            {scaleAmount(ing.amount, scale) || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-800 dark:text-zinc-200">
                            {ing.name}
                            {ing.details ? <span className="text-zinc-500 dark:text-zinc-400">, {ing.details}</span> : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {recipe.nutrition && (() => {
                  const n = recipe.nutrition;
                  const fmt = (v: number) => Math.round(v * scale);
                  return (
                    <div className="mt-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                        Per serving {scale !== 1 ? `(scaled ×${scale.toFixed(2)})` : ''}
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Calories', value: fmt(n.calories), unit: 'kcal', color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' },
                          { label: 'Protein', value: fmt(n.protein_g), unit: 'g', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
                          { label: 'Carbs', value: fmt(n.carbs_g), unit: 'g', color: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400' },
                          { label: 'Fat', value: fmt(n.fat_g), unit: 'g', color: 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400' },
                        ].map((stat) => (
                          <div key={stat.label} className={`rounded-xl p-2.5 text-center border border-transparent ${stat.color}`}>
                            <div className="text-lg font-extrabold">{stat.value}<span className="text-xs font-medium ml-0.5">{stat.unit}</span></div>
                            <div className="text-[10px] uppercase tracking-widest font-bold opacity-70 mt-0.5">{stat.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="md:col-span-3">
                <h3 className="text-lg font-bold mb-4">Instructions</h3>
                <ol className="space-y-4">
                  {steps.map((step, i) => (
                    <li key={i} className="flex gap-4">
                      <span className="shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold mt-0.5">{i + 1}</span>
                      <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        {step.replace(/^step\s*\d+[.:)]\s*/i, '')}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Rating & Notes */}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Your Rating:</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => {
                        const newRating = recipe.rating === star ? null : star;
                        onUpdateRecipe(recipe.id, { rating: newRating });
                      }}
                      className="transition-transform hover:scale-125"
                    >
                      <Star className={`w-6 h-6 ${star <= (recipe.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-300 dark:text-zinc-600'}`} />
                    </button>
                  ))}
                </div>
                {recipe.rating && <span className="text-xs text-zinc-400 font-medium">Click again to remove</span>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Personal Notes</label>
                <textarea
                  defaultValue={recipe.notes || ''}
                  onBlur={(e) => onUpdateRecipe(recipe.id, { notes: e.target.value })}
                  placeholder="e.g. Add more garlic next time, great with crusty bread..."
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-400/60 min-h-[70px] resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
