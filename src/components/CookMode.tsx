import { Flame, X, CheckSquare, Square, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { CookTimer } from '@/components/CookTimer';
import { useCookTimer } from '@/hooks/useCookTimer';
import { useWakeLock } from '@/hooks/useWakeLock';
import { parseDurations } from '@/lib/parseDurations';
import { parseIngredients } from '@/lib/recipeUtils';
import { ingredientsInStep } from '@/lib/stepIngredients';
import type { Recipe, RecipeTranslation } from '@/types';

interface Props {
  recipe: Recipe | null;
  isOpen: boolean;
  onClose: () => void;
  translation?: RecipeTranslation | null;
}

export function CookMode({ recipe, isOpen, onClose, translation }: Props) {
  const [cookStep, setCookStep] = useState(0);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [showIngredients, setShowIngredients] = useState(false);
  // Deliberately not reset when the step changes: a timer set for one step
  // usually needs to keep running while the cook reads ahead.
  const timer = useCookTimer();
  // The screen stays on for as long as cook mode is open.
  useWakeLock(isOpen && !!recipe);

  if (!recipe) return null;

  const rawInstructions = (translation?.instructions ?? recipe.instructions) ?? '';
  const steps = rawInstructions.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const baseIngredients = parseIngredients(recipe.ingredients);
  const ingredients = baseIngredients.map((ing, i) => {
    const t = translation?.ingredients?.[i];
    if (!t) return ing;
    return { amount: t.amount ?? ing.amount, name: t.name ?? ing.name, details: t.details ?? ing.details };
  });
  const currentStep = steps[cookStep] || '';
  // Not memoised: this runs a regex over one step's text, and a useMemo here
  // would sit after the `if (!recipe) return null` guard above, which breaks
  // the rules of hooks.
  const stepDurations = parseDurations(currentStep);
  // The ingredients this step mentions, shown under it so the full list is
  // rarely needed (src/lib/stepIngredients.ts).
  const stepIngredients = ingredientsInStep(currentStep, ingredients);
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
      {/*
        sm:max-w-none is not redundant: DialogContent's base class list ends in
        `sm:max-w-sm`, and tailwind-merge treats a responsive variant as a
        different group from the bare `max-w-none`, so both survive and the
        `sm:` one wins from 640px up — which capped this full-screen dialog at
        384px on every desktop.
      */}
      <DialogContent
        showCloseButton={false}
        className="inset-0 translate-x-0 translate-y-0 max-w-none sm:max-w-none w-screen h-dvh max-h-dvh rounded-none border-0 bg-zinc-950 text-white p-0 overflow-hidden"
      >
        {/* Root: full-screen flex row. The black runs to every edge; the
            controls stay off the status bar, the home indicator and the notch. */}
        <div className="flex w-full h-full overflow-hidden pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)]">

          {/* The whole list. On a phone a sheet from the bottom over a dimmed
              step, so the step stays in view above it (it used to cover the
              whole screen); from sm up a panel beside the step. */}
          {showIngredients && (
            <>
              <div
                aria-hidden="true"
                onClick={() => setShowIngredients(false)}
                className="sm:hidden fixed inset-0 z-10 bg-black/60"
              />
              <section
                aria-label="Ingredients"
                className="fixed inset-x-0 bottom-0 z-20 max-h-[72dvh] rounded-t-3xl border-t border-white/10 bg-zinc-900 pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] sm:static sm:z-auto sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-r sm:bg-transparent sm:p-0 w-full sm:w-72 shrink-0 flex flex-col overflow-hidden"
              >
                <div aria-hidden="true" className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/20" />
                <div className="shrink-0 px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
                  <span className="font-bold text-sm text-white/80 uppercase tracking-wider">Ingredients</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40 tabular-nums">{checkedIngredients.size} of {ingredients.length} done</span>
                    <button onClick={() => setShowIngredients(false)} aria-label="Hide ingredients" className="sm:hidden p-2 -mr-2 rounded-full hover:bg-white/10 text-white/60"><X className="w-5 h-5" /></button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-1">
                  {ingredients.map((ing, i) => (
                    <button
                      key={i}
                      onClick={() => toggleIngredient(i)}
                      aria-pressed={checkedIngredients.has(i)}
                      className="w-full flex items-start gap-3 px-2 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left group"
                    >
                      {checkedIngredients.has(i)
                        ? <CheckSquare className="w-5 h-5 text-sk-primary shrink-0" />
                        : <Square className="w-5 h-5 text-white/30 group-hover:text-white/50 shrink-0" />
                      }
                      <span className={`text-base sm:text-sm leading-snug ${checkedIngredients.has(i) ? 'line-through text-white/30' : 'text-white/85'} ${stepIngredients.includes(i) && !checkedIngredients.has(i) ? 'font-semibold text-white' : ''}`}>
                        {ing.amount && <span className="font-semibold text-sk-primary-fixed">{ing.amount} </span>}
                        {ing.name}
                        {ing.details && <span className="text-white/40">, {ing.details}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Main area: fixed header + scrollable step text + fixed dots + fixed nav buttons */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

            {/* Header — never scrolls */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0">
                {/* The flame of the Cook button that opened this, not a second symbol. */}
                <Flame className="w-6 h-6 text-sk-primary shrink-0" aria-hidden="true" />
                <span className="font-bold text-lg text-white truncate">{recipe.title}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setShowIngredients((v) => !v)}
                  aria-label={showIngredients ? 'Hide ingredients' : 'Show ingredients'}
                  aria-pressed={showIngredients}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold ring-1 ring-inset transition-colors ${showIngredients ? 'bg-sk-primary/20 text-sk-primary-fixed ring-sk-primary/30' : 'ring-white/15 text-white/80 hover:bg-white/10 hover:text-white'}`}
                >
                  <List className="w-4 h-4" aria-hidden="true" />
                  {/* Labelled on a phone too: an unlabelled list icon was not found. */}
                  <span>Ingredients</span>
                </button>
                <span className="text-sm font-semibold text-white/50">{cookStep + 1}/{steps.length}</span>
                <button onClick={handleClose} aria-label="Exit cook mode" className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Step text — scrollable, fills available space */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 md:px-16">
              <div className="flex flex-col items-center justify-center min-h-full py-6 sm:py-10 gap-6 sm:gap-8">
                <div className="w-12 h-12 sm:w-16 sm:h-16 shrink-0 rounded-full bg-sk-primary text-white dark:text-primary-foreground flex items-center justify-center text-2xl sm:text-3xl font-black shadow-lg shadow-sk-primary/20">
                  {cookStep + 1}
                </div>
                <p className="max-w-2xl w-full text-center text-lg sm:text-2xl md:text-3xl font-semibold leading-relaxed text-white">
                  {currentStep.replace(/^step\s*\d+[.:)]\s*/i, '')}
                </p>
                {stepIngredients.length > 0 && (
                  <section aria-label="For this step" className="w-full max-w-2xl">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 text-center mb-2.5">For this step</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {stepIngredients.map((i) => {
                        const ing = ingredients[i];
                        const done = checkedIngredients.has(i);
                        return (
                          <button
                            key={i}
                            onClick={() => toggleIngredient(i)}
                            aria-pressed={done}
                            className={`inline-flex items-baseline gap-1.5 px-3.5 py-2 rounded-xl text-base ring-1 ring-inset transition-colors ${done ? 'ring-white/10 text-white/30 line-through' : 'ring-white/15 bg-white/[0.06] text-white/90 hover:bg-white/10'}`}
                          >
                            {ing.amount && <span className={`font-semibold ${done ? '' : 'text-sk-primary-fixed'}`}>{ing.amount}</span>}
                            <span>{ing.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            </div>

            <CookTimer timer={timer} suggestions={stepDurations} />

            {/* Step dots — never scrolls */}
            <div className="shrink-0 flex justify-center gap-0.5 py-3">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCookStep(i)}
                  aria-label={`Go to step ${i + 1} of ${steps.length}`}
                  aria-current={i === cookStep ? 'step' : undefined}
                  className="p-2 flex items-center justify-center"
                >
                  <span className={`rounded-full transition-all ${i === cookStep ? 'w-6 h-2.5 bg-sk-primary-fixed' : 'w-2.5 h-2.5 bg-white/20 hover:bg-white/40'}`} />
                </button>
              ))}
            </div>

            {/* Nav buttons — never scrolls */}
            <div className="shrink-0 flex gap-3 sm:gap-4 px-4 sm:px-6 pb-6 sm:pb-8 pt-2">
              <Button
                onClick={() => setCookStep((s) => Math.max(0, s - 1))}
                disabled={isFirst}
                variant="outline"
                className="flex-1 h-12 sm:h-14 text-base sm:text-lg font-bold rounded-2xl border-white/20 text-white hover:bg-white/10 bg-transparent"
              >
                ← Previous
              </Button>
              {isLast ? (
                <Button onClick={handleClose} className="flex-1 h-12 sm:h-14 text-base sm:text-lg font-bold rounded-2xl bg-sk-primary hover:bg-sk-primary-container">
                  ✓ Done!
                </Button>
              ) : (
                <Button onClick={() => setCookStep((s) => Math.min(steps.length - 1, s + 1))} className="flex-1 h-12 sm:h-14 text-base sm:text-lg font-bold rounded-2xl bg-sk-primary hover:bg-sk-primary-container">
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
