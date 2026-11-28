import { describe, expect, it } from 'vitest';
import { basketIngredients, basketSignature, isOnList, localDay, portionsOf, upcomingMeals } from './shoppingMeals';
import type { MealPlan } from '@/types';

const NOW = new Date(2026, 10, 28, 18, 30); // Saturday evening, local time

const meal = (over: Partial<MealPlan> & { id: string; date: string }): MealPlan => ({
  recipe_id: 'r', meal_type: 'Dinner',
  recipe: { servings: 4, ingredients: [{ amount: '800 g', name: 'potatoes', details: '' }, { amount: '', name: 'salt', details: '' }] } as never,
  ...over,
});

describe('upcomingMeals', () => {
  const plans = [
    meal({ id: 'past', date: '2026-11-27' }),
    meal({ id: 'today-dinner', date: '2026-11-28' }),
    meal({ id: 'today-breakfast', date: '2026-11-28', meal_type: 'Breakfast' }),
    meal({ id: 'in-7', date: '2026-12-05' }),
    meal({ id: 'in-8', date: '2026-12-06' }),
    meal({ id: 'tomorrow', date: '2026-11-29' }),
  ];

  it('takes today through the next seven days, in cooking order', () => {
    expect(upcomingMeals(plans, NOW).map((m) => m.id)).toEqual(['today-breakfast', 'today-dinner', 'tomorrow', 'in-7']);
  });

  it('counts today as upcoming at any time of day', () => {
    // Compared as moments, a meal planned for today was "past" by the morning.
    expect(upcomingMeals(plans, new Date(2026, 10, 28, 23, 59)).map((m) => m.id)).toContain('today-dinner');
    expect(upcomingMeals(plans, new Date(2026, 10, 28, 0, 1)).map((m) => m.id)).toContain('today-dinner');
  });

  it('writes a day the way the plan stores it', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('portions', () => {
  it('uses the meal\'s own number, else the recipe\'s', () => {
    expect(portionsOf(meal({ id: 'a', date: 'x' }))).toBe(4);
    expect(portionsOf(meal({ id: 'a', date: 'x', servings: 2 }))).toBe(2);
    expect(portionsOf(meal({ id: 'a', date: 'x', servings: null }))).toBe(4);
    expect(portionsOf(meal({ id: 'a', date: 'x', recipe: { servings: null, ingredients: [] } as never }))).toBe(1);
  });

  it('is on the list unless switched off', () => {
    expect(isOnList(meal({ id: 'a', date: 'x' }))).toBe(true);
    expect(isOnList(meal({ id: 'a', date: 'x', in_shopping: false }))).toBe(false);
  });
});

describe('basketIngredients', () => {
  it('scales each amount to the meal\'s portions and leaves unticked meals out', () => {
    expect(basketIngredients([
      meal({ id: 'a', date: 'x', servings: 2 }),
      meal({ id: 'b', date: 'x', in_shopping: false }),
      meal({ id: 'c', date: 'x' }),
    ])).toEqual(['400 g potatoes', 'salt', '800 g potatoes', 'salt']);
  });

  it('scales up as well, and copes with a recipe that has no servings', () => {
    expect(basketIngredients([meal({ id: 'a', date: 'x', servings: 6 })])[0]).toBe('1200 g potatoes');
    expect(basketIngredients([meal({ id: 'a', date: 'x', servings: 3, recipe: { servings: null, ingredients: [{ amount: '2', name: 'eggs', details: '' }] } as never })])).toEqual(['6 eggs']);
  });
});

describe('basketSignature', () => {
  it('changes with which meals are on the list and with their portions, not with their order', () => {
    const a = meal({ id: 'a', date: 'x' });
    const b = meal({ id: 'b', date: 'x' });
    expect(basketSignature([a, b])).toBe(basketSignature([b, a]));
    expect(basketSignature([a, b])).not.toBe(basketSignature([a, { ...b, in_shopping: false }]));
    expect(basketSignature([a, b])).not.toBe(basketSignature([a, { ...b, servings: 2 }]));
    // Setting the recipe's own number explicitly is no change.
    expect(basketSignature([a, b])).toBe(basketSignature([a, { ...b, servings: 4 }]));
  });
});
