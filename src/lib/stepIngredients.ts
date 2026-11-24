import type { Ingredient } from '@/types';

/**
 * Which ingredients a step mentions, so cook mode can show them under it
 * ("For this step: 250g Mehl · 3 Eier") without the cook opening the list.
 *
 * Deliberately simple matching on words, for the languages in the vault
 * (German and English): a word of the ingredient's name, minus a plural or
 * inflection ending, begins a word of the step ("Zwiebel" in "Zwiebeln
 * würfeln", "tomato" in "Add the tomatoes"), or a word of the step ends a
 * German compound in the name ("Brühe" for "Gemüsebrühe", "Milch" for
 * "Kokosmilch"). Short words and describing words are ignored. A miss only
 * means the cook opens the full list; a false hit shows one ingredient too
 * many, so the rules lean towards missing.
 */

/** Lowercased words of letters only, umlauts included. */
function words(text: string): string[] {
  return text.toLowerCase().match(/\p{L}+/gu) ?? [];
}

const ENDINGS = ['es', 'en', 'n', 's', 'e'];

/** Drops one plural or inflection ending, keeping at least three letters. */
function stem(word: string): string {
  for (const end of ENDINGS) {
    if (word.endsWith(end) && word.length - end.length >= 3) return word.slice(0, -end.length);
  }
  return word;
}

/** Words in a name that say what kind, not what: never a reason to match. */
const DESCRIBING = new Set([
  'and', 'or', 'with', 'of', 'the', 'fresh', 'large', 'small', 'medium', 'ground', 'dried', 'chopped', 'whole', 'some',
  'und', 'oder', 'mit', 'frisch', 'frische', 'frischer', 'frisches', 'groß', 'große', 'großer', 'klein', 'kleine', 'kleiner',
  'gemahlen', 'gemahlener', 'getrocknet', 'getrocknete', 'gehackt', 'gehackte', 'ganze', 'etwas',
]);

/** Indexes of the ingredients the step mentions, in the order of the list. */
export function ingredientsInStep(step: string, ingredients: readonly Pick<Ingredient, 'name'>[]): number[] {
  const stepWords = words(step);
  if (stepWords.length === 0) return [];
  const stepStems = stepWords.map(stem);

  const found: number[] = [];
  ingredients.forEach((ingredient, index) => {
    const nameStems = words(ingredient.name)
      .filter((w) => w.length >= 3 && !DESCRIBING.has(w))
      .map(stem);
    const mentioned = nameStems.some((name) =>
      stepWords.some((w) => w.startsWith(name)) ||
      // A step word at the end of a German compound: "Brühe" in "Gemüsebrühe".
      stepStems.some((s) => s.length >= 4 && name.length > s.length && name.endsWith(s)),
    );
    if (mentioned) found.push(index);
  });
  return found;
}
