import { parseIngredients, scaleAmount } from '@/lib/recipeUtils';
import { MEAL_TYPES } from '@/lib/constants';
import type { MealPlan, Recipe } from '@/types';

/**
 * The meals a shopping list is built from: what is planned from today through
 * the next seven days, each with its own number of portions, and each either
 * on the list or left off it (migration 0079).
 *
 * One place for this, used by the shopping page (which shows the meals as a
 * basket) and by the store (which sends their ingredients to be merged), so
 * what is shown is what is sent.
 */
export const SHOPPING_DAYS_AHEAD = 7;
export const MAX_PORTIONS = 99;

/** A date as the plan stores it (YYYY-MM-DD), in the person's own time zone. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Planned from today through the next seven days, in the order they will be
 * cooked.
 *
 * Compared as days, not as moments: the list used to compare a plan's date
 * (midnight) with the current time, so anything planned for today was already
 * "in the past" by breakfast and never reached the shopping list.
 */
export function upcomingMeals(mealPlans: readonly MealPlan[], now: Date = new Date()): MealPlan[] {
  const first = localDay(now);
  const end = new Date(now);
  end.setDate(end.getDate() + SHOPPING_DAYS_AHEAD);
  const last = localDay(end);
  const mealOrder = (m: MealPlan) => {
    const at = (MEAL_TYPES as readonly string[]).indexOf(m.meal_type);
    return at < 0 ? MEAL_TYPES.length : at;
  };
  return mealPlans
    .filter((m) => m.date >= first && m.date <= last)
    .sort((a, b) => a.date.localeCompare(b.date) || mealOrder(a) - mealOrder(b));
}

/** How many portions the recipe is written for. */
export function recipePortions(recipe: Pick<Recipe, 'servings' | 'original_servings'> | undefined): number {
  const own = recipe?.original_servings || recipe?.servings || 1;
  return own > 0 ? own : 1;
}

/** How many portions this planned meal is cooked for: its own number, else the recipe's. */
export function portionsOf(meal: MealPlan): number {
  return meal.servings && meal.servings > 0 ? meal.servings : recipePortions(meal.recipe);
}

/** Whether the meal goes on the shopping list. On unless switched off. */
export function isOnList(meal: MealPlan): boolean {
  return meal.in_shopping !== false;
}

/**
 * The ingredient lines of the meals on the list, each amount scaled to the
 * meal's portions. This is what is sent to be merged into the list.
 */
export function basketIngredients(meals: readonly MealPlan[]): string[] {
  return meals.filter(isOnList).flatMap((meal) => {
    const scale = portionsOf(meal) / recipePortions(meal.recipe);
    return parseIngredients(meal.recipe?.ingredients ?? []).map((i) =>
      `${scale === 1 ? i.amount : scaleAmount(i.amount, scale)} ${i.name}`.trim());
  });
}

/**
 * What a generated list was made from: which meals, at how many portions.
 * Two baskets with the same signature give the same list, so a list whose
 * stored signature differs from the basket's is out of date.
 */
export function basketSignature(meals: readonly MealPlan[]): string {
  return meals.filter(isOnList).map((m) => `${m.id}:${portionsOf(m)}`).sort().join('|');
}

const basisKey = (userId: string) => `sk-shopping-basis:${userId}`;

/** The signature of the basket the current list was generated from, on this device. */
export function readListBasis(userId: string | null | undefined): string | null {
  if (!userId) return null;
  try { return localStorage.getItem(basisKey(userId)); } catch { return null; }
}

export function writeListBasis(userId: string | null | undefined, signature: string | null): void {
  if (!userId) return;
  try {
    if (signature === null) localStorage.removeItem(basisKey(userId));
    else localStorage.setItem(basisKey(userId), signature);
  } catch { /* Private mode: the page then simply cannot say whether the list is current. */ }
}
