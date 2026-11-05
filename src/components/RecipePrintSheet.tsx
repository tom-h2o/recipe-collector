import { createPortal } from 'react-dom';
import { parseIngredients } from '@/lib/recipeUtils';
import type { Ingredient, Recipe } from '@/types';

interface Props {
  recipe: Recipe;
  /** Ingredients as currently shown — scaled, translated, or AI-adjusted. */
  ingredients: Ingredient[];
  /** Servings the ingredients above correspond to, not the stored value. */
  servings: number;
  title?: string;
  description?: string | null;
  instructions?: string;
}

/**
 * The page that comes out of the printer, and out of "Save as PDF".
 *
 * A separate sheet rather than print rules over the drawer. Printing the drawer
 * gave a rounded card floating on a blurred backdrop, a decorative gradient
 * taking the top third, and the servings +/- buttons rendered as dead controls —
 * and taming that with `print:` utilities means every future style change to the
 * drawer can silently break the printed page. This markup exists only to be
 * printed, so what it produces is what it will keep producing.
 *
 * Portalled to <body> so it sits outside the dialog, which is what lets the
 * print rules in index.css hide everything else with a single selector.
 */
export function RecipePrintSheet({ recipe, ingredients, servings, title, description, instructions }: Props) {
  const list = ingredients.length ? ingredients : parseIngredients(recipe.ingredients);
  const steps = (instructions ?? recipe.instructions ?? '')
    .split(/\n+/)
    .map((s) => s.trim().replace(/^step\s*\d+[.:)]\s*/i, ''))
    .filter(Boolean);

  const totalMins = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);

  return createPortal(
    <article className="print-sheet" aria-hidden="true">
      <h1 className="print-sheet-title">{title || recipe.title}</h1>

      {(description ?? recipe.description) && (
        <p className="print-sheet-description">{description ?? recipe.description}</p>
      )}

      <p className="print-sheet-meta">
        {`Serves ${servings}`}
        {recipe.prep_time_mins ? ` · Prep ${recipe.prep_time_mins} min` : ''}
        {recipe.cook_time_mins ? ` · Cook ${recipe.cook_time_mins} min` : ''}
        {totalMins > 0 ? ` · Total ${totalMins} min` : ''}
      </p>

      <section className="print-sheet-section">
        <h2 className="print-sheet-heading">Ingredients</h2>
        <ul className="print-sheet-ingredients">
          {list.map((ing, i) => (
            <li key={i}>
              {ing.amount ? <strong>{ing.amount} </strong> : null}
              {ing.name}
              {ing.details ? `, ${ing.details}` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section className="print-sheet-section">
        <h2 className="print-sheet-heading">Instructions</h2>
        <ol className="print-sheet-steps">
          {steps.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      </section>

      {recipe.nutrition && (
        <section className="print-sheet-section">
          <h2 className="print-sheet-heading">Nutrition, per serving</h2>
          <table className="print-sheet-nutrition">
            <tbody>
              <tr><th>Calories</th><td>{recipe.nutrition.calories} kcal</td></tr>
              <tr><th>Protein</th><td>{recipe.nutrition.protein_g} g</td></tr>
              <tr><th>Carbs</th><td>{recipe.nutrition.carbs_g} g</td></tr>
              <tr><th>Fat</th><td>{recipe.nutrition.fat_g} g</td></tr>
              <tr><th>Fibre</th><td>{recipe.nutrition.fiber_g} g</td></tr>
            </tbody>
          </table>
        </section>
      )}

      {(recipe.source_name || recipe.source_url) && (
        <p className="print-sheet-source">
          {/* On paper a link is only useful if it is written out. */}
          Source: {recipe.source_name || recipe.source_url}
          {recipe.source_name && recipe.source_url ? ` — ${recipe.source_url}` : ''}
        </p>
      )}
    </article>,
    document.body,
  );
}
