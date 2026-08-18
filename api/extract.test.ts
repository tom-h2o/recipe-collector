import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { extractStructuredRecipe } from './extract';

describe('extractStructuredRecipe', () => {
  it('maps schema.org Recipe JSON-LD into the app recipe shape', () => {
    const $ = cheerio.load(`
      <html lang="de-DE">
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Recipe",
              "name": "Philadelphia-Torte ohne Backen",
              "description": "Eine zitronige Frischkaesetorte.",
              "image": { "url": "https://example.com/torte.jpg" },
              "author": { "name": "Emmi" },
              "recipeYield": "12 Personen",
              "prepTime": "PT30M",
              "cookTime": "PT0M",
              "recipeIngredient": [
                "200 g Haferkekse - alternativ Butterkekse",
                "1 Zitrone, unbehandelt - davon 3 EL Saft"
              ],
              "recipeInstructions": [
                { "@type": "HowToStep", "text": "Kekse zerkleinern." },
                { "@type": "HowToStep", "text": "Creme auf dem Boden verteilen." }
              ]
            }
          </script>
        </head>
      </html>
    `);

    const recipe = extractStructuredRecipe($, 'fallback description', 'https://example.com/fallback.jpg');

    expect(recipe).toEqual({
      title: 'Philadelphia-Torte ohne Backen',
      description: 'Eine zitronige Frischkaesetorte.',
      original_language: 'de',
      servings: 12,
      prep_time_mins: 30,
      cook_time_mins: 0,
      ingredients: [
        { amount: '200 g', name: 'Haferkekse', details: 'alternativ Butterkekse' },
        { amount: '1', name: 'Zitrone', details: 'unbehandelt, davon 3 EL Saft' },
      ],
      instructions: 'Kekse zerkleinern.\nCreme auf dem Boden verteilen.',
      image_url: 'https://example.com/torte.jpg',
      source_name: 'Emmi',
    });
  });
});
