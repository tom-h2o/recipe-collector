import { describe, it, expect } from 'vitest';
import { parseIngredients, recipeToIngredientText, scaleAmount } from './recipeUtils';

describe('parseIngredients', () => {
  it('returns empty array for empty input', () => {
    expect(parseIngredients([])).toEqual([]);
  });

  it('passes through already-parsed Ingredient objects', () => {
    const ingredients = [{ amount: '200g', name: 'pasta', details: '' }];
    expect(parseIngredients(ingredients)).toEqual(ingredients);
  });

  it('parses a plain string ingredient', () => {
    const result = parseIngredients(['salt']);
    expect(result[0].name).toBe('salt');
    expect(result[0].amount).toBe('');
  });

  it('parses amount + name', () => {
    const result = parseIngredients(['2 cups flour']);
    expect(result[0].amount).toBe('2 cups');
    expect(result[0].name).toBe('flour');
  });

  it('parses amount with details after comma', () => {
    const result = parseIngredients(['2 eggs, beaten']);
    expect(result[0].amount).toBe('2');
    expect(result[0].name).toBe('eggs');
    expect(result[0].details).toBe('beaten');
  });

  it('handles unicode fractions', () => {
    const result = parseIngredients(['½ cup sugar']);
    expect(result[0].amount).toContain('1/2');
  });

  it('parses multiple ingredients', () => {
    const result = parseIngredients(['1 tbsp olive oil', '3 cloves garlic, minced']);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('olive oil');
    expect(result[1].name).toBe('garlic');
    expect(result[1].details).toBe('minced');
  });
});

describe('recipeToIngredientText', () => {
  it('serialises ingredients to newline-separated text', () => {
    const ingredients = [
      { amount: '200g', name: 'pasta', details: '' },
      { amount: '2', name: 'eggs', details: 'beaten' },
    ];
    const text = recipeToIngredientText(ingredients);
    expect(text).toBe('200g pasta\n2 eggs, beaten');
  });

  it('omits details when empty', () => {
    const ingredients = [{ amount: '1 cup', name: 'milk', details: '' }];
    expect(recipeToIngredientText(ingredients)).toBe('1 cup milk');
  });
});

describe('scaleAmount', () => {
  it('scales an integer amount', () => {
    expect(scaleAmount('2', 3)).toBe('6');
  });

  it('scales a decimal amount', () => {
    expect(scaleAmount('1.5', 2)).toBe('3');
  });

  it('scales amount in a string with unit', () => {
    expect(scaleAmount('200g', 2)).toBe('400g');
  });

  it('trims trailing zeros from decimals', () => {
    expect(scaleAmount('1', 0.5)).toBe('0.5');
  });

  it('returns integer when result is whole', () => {
    expect(scaleAmount('0.5', 4)).toBe('2');
  });
});
