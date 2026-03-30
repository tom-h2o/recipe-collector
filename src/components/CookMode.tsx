import { ChefHat, X, CheckSquare, Square, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { parseIngredients } from '@/lib/recipeUtils';
import type { Recipe } from '@/types';

interface Props {
  recipe: Recipe | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CookMode({ recipe, isOpen, onClose }: Props) {
  const [cookStep, setCookStep] = useState(0);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [showIngredients, setShowIngredients] = useState(false);

  if (!recipe) return null;

  const steps = recipe.instructions.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const ingredients = parseIngredients(recipe.ingredients);
  const currentStep = steps[cookStep] || '';
  const isFirst = cookStep === 0;
  const isLast = cookStep === steps.length - 1;

  function handleClose() {
    onClose();
    setCookStep(0);
    setCheckedIngredients(new Set());
    setShowIngredients(false);
  }

  function toggleIngredient(i: number) {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogTrigger className="hidden" />
      <DialogContent
        showCloseButton={false}
        className="max-w-none w-screen h-screen max-h-screen rounded-none border-0 bg-zinc-950 text-white p-0 overflow-hidden"
      >
        {/* Root: full-screen flex row */}
        <div className="flex w-full h-full overflow-hidden">

          {/* Ingredients side panel */}
          {showIngredients && (
            <div className="w-64 shrink-0 border-r border-white/10 flex flex-col overflow-hidden">
              <div className="shrink-0 px-4 py-4 border-b border-white/10 flex items-center justify-between">
                <span className="font-bold text-sm text-white/80 uppercase tracking-wider">Ingredients</span>
                <span className="text-xs text-white/40">{checkedIngredients.size}/{ingredients.length}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1">
                {ingredients.map((ing, i) => (
                  <button
                    key={i}
                    onClick={() => toggleIngredient(i)}
                    className="w-full flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                  >
                    {checkedIngredients.has(i)
                      ? <CheckSquare className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                      : <Square className="w-4 h-4 text-white/30 group-hover:text-white/50 shrink-0 mt-0.5" />
                    }
                    <span className={`text-sm leading-snug ${checkedIngredients.has(i) ? 'line-through text-white/30' : 'text-white/80'}`}>
                      {ing.amount && <span className="font-semibold text-orange-300">{ing.amount} </span>}
                      {ing.name}
                      {ing.details && <span className="text-white/40">, {ing.details}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main area: fixed header + scrollable step text + fixed dots + fixed nav buttons */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

            {/* Header — never scrolls */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0">
                <ChefHat className="w-6 h-6 text-orange-400 shrink-0" />
                <span className="font-bold text-lg text-white truncate">{recipe.title}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setShowIngredients((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${showIngredients ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-white/10 text-white/50 hover:text-white/80'}`}
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline">Ingredients</span>
                </button>
                <span className="text-sm font-semibold text-white/50">Step {cookStep + 1} of {steps.length}</span>
                <button onClick={handleClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Step text — scrollable, fills available space */}
            <div className="flex-1 min-h-0 overflow-y-auto px-8 sm:px-16">
              <div className="flex flex-col items-center justify-center min-h-full py-10 gap-8">
                <div className="w-16 h-16 shrink-0 rounded-full bg-orange-500 text-white flex items-center justify-center text-3xl font-black shadow-lg shadow-orange-500/30">
                  {cookStep + 1}
                </div>
                <p className="max-w-2xl w-full text-center text-xl sm:text-2xl md:text-3xl font-semibold leading-relaxed text-white">
                  {currentStep.replace(/^step\s*\d+[.:)]\s*/i, '')}
                </p>
              </div>
            </div>

            {/* Step dots — never scrolls */}
            <div className="shrink-0 flex justify-center gap-1.5 py-3">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCookStep(i)}
                  className={`rounded-full transition-all ${i === cookStep ? 'w-6 h-2.5 bg-orange-500' : 'w-2.5 h-2.5 bg-white/20 hover:bg-white/40'}`}
                />
              ))}
            </div>

            {/* Nav buttons — never scrolls */}
            <div className="shrink-0 flex gap-4 px-6 pb-8 pt-2">
              <Button
                onClick={() => setCookStep((s) => Math.max(0, s - 1))}
                disabled={isFirst}
                variant="outline"
                className="flex-1 h-14 text-lg font-bold rounded-2xl border-white/20 text-white hover:bg-white/10 bg-transparent"
              >
                ← Previous
              </Button>
              {isLast ? (
                <Button onClick={handleClose} className="flex-1 h-14 text-lg font-bold rounded-2xl bg-orange-500 hover:bg-orange-600">
                  ✓ Done!
                </Button>
              ) : (
                <Button onClick={() => setCookStep((s) => Math.min(steps.length - 1, s + 1))} className="flex-1 h-14 text-lg font-bold rounded-2xl bg-orange-500 hover:bg-orange-600">
                  Next →
                </Button>
              )}
            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
