import { describe, expect, it } from 'vitest';
import { ingredientsInStep } from './stepIngredients';

const names = (list: string[]) => list.map((name) => ({ name }));
const found = (step: string, list: string[]) => ingredientsInStep(step, names(list)).map((i) => list[i]);

describe('the ingredients a step mentions', () => {
  it('finds German ingredients through plural and inflected forms', () => {
    const list = ['Hokkaido-Kürbis', 'Zwiebel', 'Knoblauch', 'Gemüsebrühe', 'Kokosmilch', 'Salz', 'Eier'];
    expect(found('Kürbis würfeln, Zwiebeln und Knoblauch hacken.', list)).toEqual(['Hokkaido-Kürbis', 'Zwiebel', 'Knoblauch']);
    // The end of a compound: "Brühe" for Gemüsebrühe, "Milch" for Kokosmilch.
    expect(found('Mit Brühe aufgießen und 20 Minuten köcheln, dann die Milch einrühren.', list)).toEqual(['Gemüsebrühe', 'Kokosmilch']);
    expect(found('Die Eier verquirlen und salzen.', list)).toEqual(['Salz', 'Eier']);
  });

  it('finds English ingredients, plural or not', () => {
    const list = ['flour', 'mozzarella', 'plum tomatoes', 'olive oil', 'eggs'];
    expect(found('Spread the tomatoes, top with mozzarella and drizzle with oil.', list)).toEqual(['mozzarella', 'plum tomatoes', 'olive oil']);
    expect(found('Whisk the egg and fold in the flour.', list)).toEqual(['flour', 'eggs']);
  });

  it('does not match inside another word, or on describing words', () => {
    // "oil" is not in "boil"; "fresh" says nothing about which ingredient.
    expect(found('Bring the water to a boil.', ['olive oil', 'fresh basil'])).toEqual([]);
    expect(found('Frische Kräuter darüber streuen.', ['frische Petersilie'])).toEqual([]);
    expect(found('', ['salt'])).toEqual([]);
  });
});
