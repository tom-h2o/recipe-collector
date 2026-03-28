import type { Ingredient } from '@/types';

// Matches amounts including:
// - Integers and decimals: 1, 1.5, .5
// - Fractions: 1/2, 3/4
// - Mixed numbers: 1 1/2, 1½
// - Unicode vulgar fractions: ½ ¼ ¾ ⅓ ⅔ ⅛ ⅜ ⅝ ⅞
// - Ranges: 2-3
// Optionally followed by a unit
const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2', '¼': '1/4', '¾': '3/4',
  '⅓': '1/3', '⅔': '2/3',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

const AMOUNT_RE =
  /^((?:\d+\s*[-–]?\s*)?(?:\d+\/\d+|[\d.,]+|[½¼¾⅓⅔⅛⅜⅝⅞])?\s*(?:tbsp?|tsp?|tablespoons?|teaspoons?|cups?|fl\.?\s*oz\.?|oz\.?|lbs?|pounds?|kg|g|ml|l|liters?|litres?|cloves?|bunches?|heads?|slices?|pieces?|pinch(?:es)?|handfuls?|cans?|whole|large|medium|small|stalks?|sprigs?|leaves?|sheets?|blocks?)?(?:\s|$))/i;

function normaliseAmount(raw: string): string {
  return raw.replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, (ch) => UNICODE_FRACTIONS[ch] ?? ch).trim();
}

export function parseIngredients(raw: Ingredient[] | string[]): Ingredient[] {
  if (!raw || raw.length === 0) return [];
  if (typeof raw[0] === 'object' && 'name' in raw[0]) return raw as Ingredient[];
  return (raw as string[]).map((s) => {
    const match = s.match(AMOUNT_RE);
    const rawAmount = match ? match[0].trim() : '';
    const amount = normaliseAmount(rawAmount);
    const rest = rawAmount ? s.slice(rawAmount.length).trim() : s.trim();
    let name = rest;
    let details = '';
    if (rest.includes(',')) {
      const parts = rest.split(',');
      name = parts[0].trim();
      details = parts.slice(1).join(',').trim();
    }
    return { amount, name, details };
  });
}

export function recipeToIngredientText(ingredients: Ingredient[] | string[]): string {
  const parsed = parseIngredients(ingredients);
  return parsed
    .map((i) => `${i.amount} ${i.name}${i.details ? `, ${i.details}` : ''}`.trim())
    .join('\n');
}

export function scaleAmount(amount: string, scale: number): string {
  return amount.replace(/[\d.]+/g, (n) => {
    const scaled = parseFloat(n) * scale;
    return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(2).replace(/\.?0+$/, '');
  });
}
