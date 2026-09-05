import { Type } from '@google/genai';
import type { Schema } from '@google/genai';

/**
 * Response schemas passed to Gemini as `responseSchema`.
 *
 * `responseMimeType: 'application/json'` only asks for JSON; the model can still
 * emit something that does not parse. Four of the five failures ever recorded in
 * gemini_logs were exactly that — "Expected ',' or '}' after property value" on
 * tag, translate and extract — each costing a second billed call to the JSON
 * repair path, which then failed too.
 *
 * A responseSchema switches Gemini to constrained decoding, so the output is
 * structurally guaranteed. The Zod schemas in schemas.ts still run on the result:
 * these constrain shape, Zod enforces the finer rules Gemini cannot express
 * (a two-letter language code, a uuid, a non-empty string). Belt and braces on
 * purpose — this is untrusted model output.
 *
 * Gemini supports only a subset of JSON Schema: object/array/string/number/
 * integer/boolean, plus properties, required, items, enum, nullable and
 * propertyOrdering. No unions, no defaults, no min/max on strings.
 */

const ingredientItem: Schema = {
  type: Type.OBJECT,
  properties: {
    amount: { type: Type.STRING },
    name: { type: Type.STRING },
    details: { type: Type.STRING },
  },
  required: ['amount', 'name', 'details'],
  propertyOrdering: ['amount', 'name', 'details'],
};

export const extractedRecipeResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    // Zod additionally enforces exactly two characters.
    original_language: { type: Type.STRING },
    servings: { type: Type.INTEGER, nullable: true },
    prep_time_mins: { type: Type.INTEGER, nullable: true },
    cook_time_mins: { type: Type.INTEGER, nullable: true },
    ingredients: { type: Type.ARRAY, items: ingredientItem },
    instructions: { type: Type.STRING },
    image_url: { type: Type.STRING },
    source_name: { type: Type.STRING },
  },
  required: [
    'title', 'description', 'original_language', 'servings', 'prep_time_mins',
    'cook_time_mins', 'ingredients', 'instructions', 'image_url', 'source_name',
  ],
  propertyOrdering: [
    'title', 'description', 'original_language', 'servings', 'prep_time_mins',
    'cook_time_mins', 'ingredients', 'instructions', 'image_url', 'source_name',
  ],
};

export const tagResponseSchema: Schema = {
  type: Type.ARRAY,
  items: { type: Type.STRING },
};

export const nutritionResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    calories: { type: Type.INTEGER },
    protein_g: { type: Type.INTEGER },
    carbs_g: { type: Type.INTEGER },
    fat_g: { type: Type.INTEGER },
    fiber_g: { type: Type.INTEGER },
  },
  required: ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'],
  propertyOrdering: ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'],
};

export const shoppingResponseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING },
      items: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['category', 'items'],
    propertyOrdering: ['category', 'items'],
  },
};

export const scaledIngredientsResponseSchema: Schema = {
  type: Type.ARRAY,
  items: ingredientItem,
};

/** Zod additionally requires each entry to be a uuid. */
export const suggestResponseSchema: Schema = {
  type: Type.ARRAY,
  items: { type: Type.STRING },
};

export const translationResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    detectedSourceLanguage: { type: Type.STRING },
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    instructions: { type: Type.STRING },
    ingredients: { type: Type.ARRAY, items: ingredientItem },
  },
  // detectedSourceLanguage stays optional: it is advisory, and forcing the model
  // to invent one when it cannot tell is worse than its absence.
  required: ['title', 'description', 'instructions', 'ingredients'],
  propertyOrdering: ['detectedSourceLanguage', 'title', 'description', 'instructions', 'ingredients'],
};
