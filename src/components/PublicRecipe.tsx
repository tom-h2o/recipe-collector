import { useState } from 'react';
import { ChefHat, Users, Printer, Play, Minus, Plus, RotateCcw } from 'lucide-react';
import { parseIngredients, scaleAmount } from '@/lib/recipeUtils';
import { CookMode } from '@/components/CookMode';
import type { Recipe } from '@/types';

interface Props {
  recipe: Recipe;
}

/**
 * The page behind a public share link. Rendered for visitors with no account,
 * so everything here must work without auth: scaling and cook mode are pure
 * client-side maths, and no AI endpoint is reachable from this page (they all
 * require a Bearer token and are rate-limited per user, so exposing them to
 * anonymous callers would put the Gemini budget in strangers' hands).
 */
export function PublicRecipe({ recipe }: Props) {
  const baseServings = recipe.original_servings || recipe.servings || 1;
  const [servings, setServings] = useState(baseServings);
  const [isCookMode, setIsCookMode] = useState(false);

  const scale = servings / baseServings;
  const isScaled = servings !== baseServings;
  const parsed = parseIngredients(recipe.ingredients).map((i) => ({
    ...i,
    amount: isScaled ? (scaleAmount(i.amount, scale) || i.amount) : i.amount,
  }));
  const steps = recipe.instructions.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  // Cook mode reads ingredients off the recipe, so hand it the scaled copy —
  // otherwise stepping into cook mode silently reverts the cook's own maths.
  const scaledRecipe: Recipe = { ...recipe, ingredients: parsed, servings };

  return (
    <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-950 md:shadow-2xl rounded-3xl overflow-hidden print:shadow-none print:w-full border border-zinc-200 dark:border-zinc-800 break-inside-avoid">
      {recipe.image_url && (
        <img src={recipe.image_url} className="w-full h-64 md:h-96 object-cover" alt={recipe.title} />
      )}
      <div className="p-8 md:p-12 space-y-8">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-black mb-4">{recipe.title}</h1>
            {recipe.description && (
              <p className="text-lg text-zinc-600 dark:text-zinc-400">{recipe.description}</p>
            )}
          </div>
          <div className="print:hidden flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsCookMode(true)}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground font-bold transition"
            >
              <Play className="w-4 h-4" /> Cook
            </button>
            <button
              onClick={() => window.print()}
              aria-label="Print this recipe"
              className="p-3 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition text-zinc-600 dark:text-zinc-300"
            >
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Servings stepper. Printed output keeps whatever the reader chose. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-3 bg-sk-primary-fixed/40 text-sk-primary px-4 py-2 rounded-full font-bold">
            <Users className="w-4 h-4" />
            <button
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              disabled={servings <= 1}
              aria-label="Fewer servings"
              className="print:hidden p-1 rounded-full hover:bg-sk-primary/10 disabled:opacity-40 transition"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span aria-live="polite">Serves {servings}</span>
            <button
              onClick={() => setServings((s) => s + 1)}
              aria-label="More servings"
              className="print:hidden p-1 rounded-full hover:bg-sk-primary/10 transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {isScaled && (
            <button
              onClick={() => setServings(baseServings)}
              className="print:hidden inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-sk-primary dark:text-zinc-400 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset to {baseServings}
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 border-b pb-2">
              <ChefHat className="text-sk-primary w-6 h-6" /> Ingredients
            </h2>
            <ul className="space-y-3">
              {parsed.map((i, idx) => (
                <li key={idx} className="flex items-start gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                  <div className="w-2 h-2 mt-2 rounded-full bg-sk-primary shrink-0" />
                  {i.amount && <span className="font-bold text-sk-primary">{i.amount}</span>}
                  <span className="text-zinc-800 dark:text-zinc-200">
                    {i.name}
                    {i.details ? <span className="text-zinc-500 dark:text-zinc-400">, {i.details}</span> : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-4 border-b pb-2">Instructions</h2>
            <ol className="space-y-6 list-decimal list-outside ml-5">
              {steps.map((step, idx) => (
                <li key={idx} className="text-zinc-700 dark:text-zinc-300 pl-2 leading-relaxed font-medium">{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <CookMode recipe={scaledRecipe} isOpen={isCookMode} onClose={() => setIsCookMode(false)} />
    </div>
  );
}
