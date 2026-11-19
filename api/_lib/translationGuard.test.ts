import { describe, expect, it } from 'vitest';
import { assertPlausibleTranslation, findTranslationFault, splitSteps, TranslationRejectedError, type TranslatableText } from './translationGuard';

const source: TranslatableText = {
  title: 'Vegan Chocolate Mousse (Quick, Easy, Healthy)',
  description: 'A silky mousse made from silken tofu and dark chocolate.',
  instructions: 'Melt the chocolate over a water bath.\nBlend the tofu until completely smooth.\nFold the chocolate into the tofu and chill for 2 hours.',
  ingredients: [
    { amount: '200g', name: 'dark chocolate', details: 'at least 70%' },
    { amount: '300g', name: 'silken tofu', details: '' },
    { amount: '2 tbsp', name: 'maple syrup', details: '' },
  ],
};

const german: TranslatableText = {
  title: 'Vegane Mousse au Chocolat (schnell, einfach, gesund)',
  description: 'Eine seidige Mousse aus Seidentofu und Zartbitterschokolade.',
  instructions: 'Die Schokolade über dem Wasserbad schmelzen.\nDen Tofu vollständig glatt pürieren.\nDie Schokolade unter den Tofu heben und 2 Stunden kalt stellen.',
  ingredients: [
    { amount: '200g', name: 'Zartbitterschokolade', details: 'mindestens 70%' },
    { amount: '300g', name: 'Seidentofu', details: '' },
    { amount: '2 EL', name: 'Ahornsirup', details: '' },
  ],
};

describe('findTranslationFault', () => {
  it('accepts an honest translation', () => {
    expect(findTranslationFault(source, german)).toBeNull();
  });

  it('refuses the title that was actually stored', () => {
    // Verbatim from a stored translation, as the user pasted it: the model's
    // reasoning ran on into the field after a stray code fence.
    const leaked = {
      ...german,
      title: 'Vegan Chocolate Mousse (Quick, Easy, Healthy)``` Wait! I almost output extra text and markdown!...',
    };
    expect(findTranslationFault(source, leaked)).toBe('the title contains a code fence');
  });

  it('refuses a code fence in any field, including an ingredient', () => {
    expect(findTranslationFault(source, { ...german, instructions: '```json\n' + german.instructions })).toMatch(/instructions contains a code fence/);
    expect(findTranslationFault(source, { ...german, description: german.description + '```' })).toMatch(/description contains a code fence/);
    const ingredients = [{ ...german.ingredients[0], name: 'Schokolade```' }, ...german.ingredients.slice(1)];
    expect(findTranslationFault(source, { ...german, ingredients })).toMatch(/ingredient contains a code fence/);
  });

  it('does not blame the translation for a fence the recipe itself contains', () => {
    const odd = { ...source, instructions: 'Type ``` into the box.\n' + source.instructions };
    expect(findTranslationFault(odd, { ...german, instructions: 'Tippe ``` in das Feld.\n' + german.instructions })).toBeNull();
  });

  it('refuses a title that has grown out of all proportion, with no fence to give it away', () => {
    const rambling = { ...german, title: german.title + ' ' + 'Let me double check the output format before answering. '.repeat(4) };
    expect(findTranslationFault(source, rambling)).toBe('the title is far longer than the original');
  });

  it('refuses a title that runs over several lines', () => {
    expect(findTranslationFault(source, { ...german, title: 'Vegane Mousse\nau Chocolat' })).toBe('the title runs over several lines');
  });

  it('lets a short title grow the way a real one does', () => {
    // Two characters to twenty-two is a factor of eleven and entirely normal.
    const short = { ...source, title: '麻婆' };
    expect(findTranslationFault(short, { ...german, title: 'Mapo-Tofu nach Sichuan-Art' })).toBeNull();
  });

  it('refuses a translation that gained or lost an ingredient', () => {
    expect(findTranslationFault(source, { ...german, ingredients: german.ingredients.slice(0, 2) }))
      .toBe('it has 2 ingredients where the recipe has 3');
  });

  it('refuses instructions that stop part-way through', () => {
    const long = { ...source, instructions: source.instructions.repeat(4) };
    expect(findTranslationFault(long, { ...german, instructions: 'Schmelzen.' })).toBe('the instructions are cut short');
  });

  it('refuses instructions carrying far more than the steps', () => {
    const bloated = { ...german, instructions: german.instructions + '\n' + 'Now I need to verify the JSON is valid. '.repeat(40) };
    expect(findTranslationFault(source, bloated)).toBe('the instructions are far longer than the original');
  });

  it('does not call short instructions cut short', () => {
    const brief = { ...source, instructions: 'Mix and chill.' };
    expect(findTranslationFault(brief, { ...german, instructions: 'Mischen.' })).toBeNull();
  });
});

describe('steps', () => {
  it('splits a method the way the views number it', () => {
    expect(splitSteps('Melt.\n\n  Blend.  \nChill.\n')).toEqual(['Melt.', 'Blend.', 'Chill.']);
    expect(splitSteps('One paragraph, no breaks.')).toEqual(['One paragraph, no breaks.']);
  });

  it('refuses a translation that ran the steps together', () => {
    // The reported fault: every word translated, and steps 1 to 3 shown as
    // one numbered point.
    const merged = { ...german, instructions: german.instructions.replace(/\n/g, ' ') };
    expect(findTranslationFault(source, merged)).toBe('it has 1 step where the recipe has 3');
  });

  it('refuses a translation that dropped or invented a step', () => {
    const lines = german.instructions.split('\n');
    expect(findTranslationFault(source, { ...german, instructions: lines.slice(0, 2).join('\n') }))
      .toBe('it has 2 steps where the recipe has 3');
    expect(findTranslationFault(source, { ...german, instructions: german.instructions + '\nGuten Appetit!' }))
      .toBe('it has 4 steps where the recipe has 3');
  });

  it('does not count blank lines as steps', () => {
    const spaced = { ...source, instructions: source.instructions.replace(/\n/g, '\n\n') };
    expect(findTranslationFault(spaced, german)).toBeNull();
  });
});

describe('assertPlausibleTranslation', () => {
  it('throws wording a person can read, naming the fault for the log', () => {
    const leaked = { ...german, title: german.title + '```' };
    expect(() => assertPlausibleTranslation(source, leaked)).toThrow(TranslationRejectedError);
    expect(() => assertPlausibleTranslation(source, leaked)).toThrow(
      'The translation came back garbled (the title contains a code fence), so it was not saved. Please try again.',
    );
  });

  it('must not look like a provider envelope, or describeGeminiError would replace it', () => {
    try {
      assertPlausibleTranslation(source, { ...german, title: german.title + '```' });
    } catch (err) {
      expect((err as Error).message.trimStart().startsWith('{')).toBe(false);
    }
  });
});
