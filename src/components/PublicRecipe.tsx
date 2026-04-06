import { ChefHat, Users, Printer } from 'lucide-react';
import { parseIngredients } from '@/lib/recipeUtils';
import type { Recipe } from '@/types';

interface Props {
  recipe: Recipe;
}

export function PublicRecipe({ recipe }: Props) {
  const parsed = parseIngredients(recipe.ingredients);
  const steps = recipe.instructions.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-950 md:shadow-2xl rounded-3xl overflow-hidden print:shadow-none print:w-full border border-zinc-200 dark:border-zinc-800 break-inside-avoid">
      {recipe.image_url && (
        <img src={recipe.image_url} className="w-full h-64 md:h-96 object-cover" alt={recipe.title} />
      )}
      <div className="p-8 md:p-12 space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl md:text-5xl font-black mb-4">{recipe.title}</h1>
            {recipe.description && (
              <p className="text-lg text-zinc-600 dark:text-zinc-400">{recipe.description}</p>
            )}
          </div>
          <button
            onClick={() => window.print()}
            className="print:hidden p-3 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 transition text-zinc-600 dark:text-zinc-300"
          >
            <Printer className="w-5 h-5" />
          </button>
        </div>

        {recipe.servings && (
          <div className="inline-flex items-center gap-2 bg-sk-primary-fixed/40 text-sk-primary px-4 py-2 rounded-full font-bold">
            <Users className="w-4 h-4" /> Serves {recipe.servings}
          </div>
        )}

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
    </div>
  );
}
