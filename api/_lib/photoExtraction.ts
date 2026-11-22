import type { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import { generateFromParts } from './gemini.js';
import { extractedRecipeResponseSchema } from './responseSchemas.js';
import { extractedRecipeSchema } from './schemas.js';
import { modelFor, type Settings } from './supabase.js';
import type { ImageKind } from '../../shared/imageKind.js';

/**
 * Reading a recipe off images: the photo branch of POST /api/extract and the
 * iPhone Shortcut import (shortcutImport.ts) both come here, so a photo is read
 * the same way whichever door it came through.
 *
 * Also home to the language rules every extraction prompt shares
 * (extract.ts builds its page, PDF and text prompts from them).
 */

export type ExtractedRecipeData = z.infer<typeof extractedRecipeSchema>;

/**
 * Without this, Gemini reports the source language correctly in
 * "original_language" but still writes the recipe itself in English.
 * The JSON skeletons below use English sample values, which biases it further,
 * so the rule has to be stated explicitly and repeated in the rule list.
 */
export const LANGUAGE_DIRECTIVE = `CRITICAL — LANGUAGE:
First detect the language of the text in the source. Then write the ENTIRE response IN THAT LANGUAGE.
"title", "description", "instructions", and every ingredient "name" and "details" MUST be written in the detected source language — do NOT translate them into English.
For example, if the source is in Polish, "title", "description", "instructions" and all ingredient names must be Polish. If it is in German, they must be German.
The English words in the JSON example below illustrate the STRUCTURE ONLY — never copy their language.`;

export const LANGUAGE_RULE = `- Write "title", "description", "instructions", and all ingredient "name"/"details" values in the detected source language, matching "original_language". Never translate the recipe into English unless the source itself is English.`;

export function photoPrompt(unit: 'C' | 'F', imageCount: number) {
  const multi = imageCount > 1;
  const intro = multi
    ? `You are a culinary assistant that extracts recipes from food photos or handwritten recipe cards.
You are given ${imageCount} images that are pages or photos of ONE SINGLE recipe, provided in reading order.
Read all ${imageCount} images together and combine them into one complete recipe.`
    : `You are a culinary assistant that extracts recipes from food photos or handwritten recipe cards.
Look at the image carefully and extract any recipe information visible.`;

  return `${intro}

${LANGUAGE_DIRECTIVE}

Return ONLY a JSON object with this exact structure:
{
  "title": "Recipe Title",
  "description": "Short, enticing summary of the dish (1-2 sentences)",
  "original_language": "en",
  "servings": 4,
  "prep_time_mins": 15,
  "cook_time_mins": 30,
  "ingredients": [
    { "amount": "200g", "name": "pasta", "details": "" },
    { "amount": "2", "name": "eggs", "details": "beaten" },
    { "amount": "", "name": "salt", "details": "to taste" }
  ],
  "instructions": "Step 1: Do this.\\nStep 2: Do that.",
  "image_url": "",
  "source_name": ""
}

Rules:
- "original_language" MUST ALWAYS be a 2-letter ISO 639-1 language code detected from the text visible in the image${multi ? 's' : ''}.
${LANGUAGE_RULE}
- If this is a photo of a finished dish with no readable text, infer a likely recipe and write it in the language of any text visible in the image; if there is none, use English and set "original_language" to "en".${multi ? `
- Treat the ${imageCount} images as ONE recipe, not ${imageCount} separate recipes. Return a single recipe object.
- Merge content across images in the order given: ingredients from every image belong to the same list, and instructions continue from one image to the next.
- If a list or a step is cut off at the edge of one image and continues on the next, join it into a single entry rather than repeating it.
- Do not output the same ingredient or step twice when it appears on more than one image (e.g. a repeated header or an overlapping photo).` : ''}
- "ingredients" MUST be an array of objects with "amount", "name", and "details".
- "servings", "prep_time_mins", "cook_time_mins" must be integers or null if unknown.
- Express all temperatures in °${unit} (${unit === 'C' ? 'Celsius' : 'Fahrenheit'}). Convert any other unit found.
- "instructions" should use newlines to separate steps. Remove any existing step numbering.
- "image_url" and "source_name" should always be empty string.`;
}


export interface ImagesToRead {
  supabase: SupabaseClient;
  client: GoogleGenAI;
  settings: Settings;
  userId: string;
  images: { data: string; mimeType: string }[];
  /**
   * A camera photo is the hardest thing to read and runs as its own task (and
   * model); a screenshot holds clean digital text, like a web page.
   */
  kind: ImageKind;
  /** Shown in the log's input preview, e.g. "Shortcut". */
  via?: string;
}

/**
 * One recipe from one or more images, sent together so the model sees every
 * page at once. Retried and falling back like every AI call
 * (generateFromParts), logged as one gemini_logs row (extract-photo or
 * extract-screenshot), and checked against the recipe schema: an answer with
 * no title, ingredients or method throws a ZodError rather than coming back
 * as an empty recipe.
 */
export async function extractRecipeFromImages({ supabase, client, settings, userId, images, kind, via }: ImagesToRead): Promise<ExtractedRecipeData> {
  const task = kind === 'screenshot' ? 'extract' : 'photo';
  const endpoint = kind === 'screenshot' ? 'extract-screenshot' : 'extract-photo';
  const startTime = Date.now();
  // All pages go into a single request so the model sees the whole recipe at once.
  const parts = [
    ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
    { text: photoPrompt(settings.temperature_unit, images.length) },
  ];
  const inputPreview = `${via ? `[${via}] ` : ''}[${images.length} image${images.length === 1 ? '' : 's'}: ${images.map((i) => i.mimeType).join(', ')}]`;
  // Retried, and moved to the other model if this one cannot serve;
  // progress says which model answered and how many calls it took.
  const progress = { attempts: 0, model: modelFor(settings, task) };
  try {
    const response = await generateFromParts(client, progress.model, parts, { responseSchema: extractedRecipeResponseSchema }, progress);
    const text = response.text;
    if (!text) throw new Error('The AI returned an empty response.');
    const recipeData = extractedRecipeSchema.parse(JSON.parse(text));
    supabase.from('gemini_logs').insert({ endpoint, model: progress.model, model_version: response.modelVersion ?? null, attempts: progress.attempts, status: 'success', latency_ms: Date.now() - startTime, input_preview: inputPreview, output_preview: text.substring(0, 300), user_id: userId }).then(() => {}, () => {});
    return recipeData;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    supabase.from('gemini_logs').insert({ endpoint, model: progress.model, attempts: progress.attempts, status: 'error', latency_ms: Date.now() - startTime, input_preview: inputPreview, error_message: errorMessage, user_id: userId }).then(() => {}, () => {});
    throw err;
  }
}
