import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  extractedRecipeResponseSchema,
  nutritionResponseSchema,
  translationResponseSchema,
} from '../../api/_lib/responseSchemas';
import {
  extractedRecipeSchema,
  nutritionResultSchema,
  translationResultSchema,
} from '../../api/_lib/schemas';

/**
 * Four of the five failures ever recorded in gemini_logs were malformed JSON —
 * "Expected ',' or '}' after property value" on tag, translate and extract.
 * responseMimeType only asks for JSON; responseSchema constrains the shape.
 *
 * The Gemini schemas are hand-written because Gemini accepts only a subset of
 * JSON Schema, so they can drift from the Zod schemas that validate the result.
 * These tests pin them together.
 */

/** Keys the Zod object requires (everything without a default and not optional). */
function zodKeys(schema: { shape: Record<string, unknown> }): string[] {
  return Object.keys(schema.shape).sort();
}

describe('Gemini schemas match the Zod schemas that validate their output', () => {
  it('extracted recipe', () => {
    expect((extractedRecipeResponseSchema.properties
      ? Object.keys(extractedRecipeResponseSchema.properties)
      : []).sort()).toEqual(zodKeys(extractedRecipeSchema as never));
  });

  it('nutrition', () => {
    expect(Object.keys(nutritionResponseSchema.properties ?? {}).sort())
      .toEqual(zodKeys(nutritionResultSchema as never));
  });

  it('translation', () => {
    expect(Object.keys(translationResponseSchema.properties ?? {}).sort())
      .toEqual(zodKeys(translationResultSchema as never));
  });
});

describe('nullable fields stay nullable', () => {
  it('lets the model say it does not know the timings or servings', () => {
    // Forcing a number here would make the model invent one. Verified against the
    // live API: a recipe with no stated prep time returns prep_time_mins: null.
    const props = extractedRecipeResponseSchema.properties ?? {};
    for (const key of ['servings', 'prep_time_mins', 'cook_time_mins']) {
      expect(props[key], `${key} must accept null`).toMatchObject({ nullable: true });
    }
  });
});

/**
 * An endpoint that forgets its schema still works — it just loses the guarantee
 * and can fail the way tag, translate and extract already did in production.
 */
describe('no AI endpoint sends an unconstrained request', () => {
  const apiDir = path.resolve(process.cwd(), 'api');
  // Tagging and nutrition run in _lib/enrich.ts, shared by their endpoints and
  // the iPhone Shortcut import, which saves and enriches on the server.
  const aiSources = ['_lib/enrich', 'suggest', 'scale', 'shopping', 'translate', 'extract'];

  for (const name of aiSources) {
    it(`${name}.ts constrains its response shape`, () => {
      const src = fs.readFileSync(path.join(apiDir, `${name}.ts`), 'utf8');
      // The colon matters: `import { tagResponseSchema }` also contains the
      // word, so matching it alone passes even when the schema is imported and
      // never actually sent.
      expect(src).toMatch(/responseSchema:/);
    });
  }

  it('extract constrains the photo and PDF branches too, not just the URL one', () => {
    // Those two do not go through generateJson, which is how they missed the
    // modelVersion logging in #23 — and, until they moved onto
    // generateFromParts, every retry: a 503 failed a photo on the first try.
    // The photo branch now lives in _lib/photoExtraction.ts, shared with the
    // iPhone Shortcut import; the PDF branch is still in extract.ts.
    const files = ['extract.ts', '_lib/photoExtraction.ts'];
    const src = files.map((f) => fs.readFileSync(path.join(apiDir, f), 'utf8')).join('\n');
    expect(src, 'extraction calls Gemini directly, skipping retry and fallback').not.toMatch(/\.generateContent\(/);
    const calls = src.match(/generateFromParts\([^;]*\);/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) expect(call).toMatch(/responseSchema:/);
  });
});
