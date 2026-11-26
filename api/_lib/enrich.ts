import type { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateJson, EMBEDDING_MODEL } from './gemini.js';
import { modelFor, thinkingFor, type Settings } from './supabase.js';
import { nutritionResponseSchema, tagResponseSchema } from './responseSchemas.js';
import { nutritionResultSchema, tagResultSchema } from './schemas.js';
import { makeCacheKey, getCached, setCached } from './cache.js';
import { NUTRITION_TEMPLATE, TAG_TEMPLATE, AVAILABLE_TAGS } from './prompts.js';
import { checkRateLimit } from './rateLimit.js';

/**
 * What runs after a recipe is saved: tags (plus the embedding recipe search
 * uses) and a nutrition estimate. The app asks for both through /api/tag and
 * /api/nutrition right after a save; the iPhone Shortcut import saves on the
 * server and calls these directly. One implementation, so a recipe sent from
 * the Photos app is tagged and estimated exactly like one added in the app.
 */

/** The person's daily allowance is used up; the endpoints answer 429. */
export class DailyLimitError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`Daily AI call limit reached (${limit} calls/day). Resets at midnight UTC.`);
    this.name = 'DailyLimitError';
    this.limit = limit;
  }
}

export interface EnrichContext {
  supabase: SupabaseClient;
  client: GoogleGenAI;
  settings: Settings;
  userId: string;
}

export interface RecipeText {
  id: string;
  title: string;
  description?: string | null;
  ingredients: unknown;
  instructions?: string | null;
  servings?: number | null;
}

function ingredientLines(ingredients: unknown): string[] {
  if (!Array.isArray(ingredients)) return [String(ingredients ?? '')];
  return ingredients.map((i: unknown) => {
    if (typeof i === 'object' && i !== null && 'name' in i) {
      const ing = i as { amount?: string; name: string };
      return `${ing.amount || ''} ${ing.name}`.trim();
    }
    return String(i);
  });
}

function parseTagResult(value: unknown): string[] {
  const parsed = tagResultSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid AI tag output: ${parsed.error.issues[0]?.message ?? 'Invalid response'}`);
  return parsed.data;
}

function parseNutritionResult(value: unknown) {
  const parsed = nutritionResultSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid AI nutrition output: ${parsed.error.issues[0]?.message ?? 'Invalid response'}`);
  return parsed.data;
}

export function buildTagPrompt(template: string, title: string, description: string, ingredientText: string, instructionPreview: string): string {
  return `${template}

Recipe:
Title: ${title}
Description: ${description || ''}
Ingredients: ${ingredientText}
Instructions: ${instructionPreview}`;
}

export function buildNutritionPrompt(template: string, title: string, ingredientText: string, servings: number | null): string {
  return `${template}

Recipe: ${title || ''}
Servings: ${servings ?? 'unknown'}
Ingredients:
${ingredientText}

Return ONLY a JSON object with these exact keys (all values are numbers rounded to the nearest integer, per serving):
{
  "calories": 450,
  "protein_g": 28,
  "carbs_g": 40,
  "fat_g": 18,
  "fiber_g": 6
}`;
}

/**
 * The recipe's embedding, for Suggest's vector search. Cached by its text, like
 * the tags beside it: a repeated tag request is answered from the cache and
 * costs none of the allowance, and without this cache each repeat still made a
 * free call to the embedding model.
 */
async function embed(supabase: SupabaseClient, client: GoogleGenAI, recipe: RecipeText, ingredientText: string, where: string): Promise<number[] | null> {
  const contents = `Title: ${recipe.title}\nDescription: ${recipe.description || ''}\nIngredients: ${ingredientText}\nInstructions: ${recipe.instructions || ''}`;
  const cacheKey = makeCacheKey('embedding', { model: EMBEDDING_MODEL, contents });
  const cached = await getCached<number[]>(supabase, cacheKey);
  if (Array.isArray(cached) && cached.length > 0) return cached;
  try {
    const embedResponse = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents,
      config: { outputDimensionality: 768 },
    });
    const values = embedResponse.embeddings?.[0]?.values ?? null;
    if (values) setCached(supabase, cacheKey, 'embedding', values, 24 * 30);
    return values;
  } catch (embedErr) {
    console.warn(`Embedding generation failed${where}:`, embedErr);
    return null;
  }
}

/**
 * Tags the recipe from the fixed list, stores them with an embedding, and
 * returns them. A cached answer costs none of the allowance; otherwise throws
 * DailyLimitError when the allowance is used up.
 */
export async function tagRecipe({ supabase, client, settings, userId }: EnrichContext, recipe: RecipeText): Promise<string[]> {
  const ingredientText = ingredientLines(recipe.ingredients).join(', ');
  const instructionPreview = (recipe.instructions || '').substring(0, 1000);
  const prompt = buildTagPrompt(TAG_TEMPLATE, recipe.title, recipe.description ?? '', ingredientText, instructionPreview);

  const store = async (tags: string[], embedding: number[] | null) => {
    const updatePayload: Record<string, unknown> = { tags };
    if (embedding) updatePayload.embedding = embedding;
    const { error: updateError } = await supabase.from('recipes').update(updatePayload).eq('id', recipe.id).eq('user_id', userId);
    if (updateError) throw updateError;
  };

  const cacheKey = makeCacheKey('tag', { title: recipe.title, description: recipe.description ?? '', ingredientText, instructions: instructionPreview });
  const cachedTags = await getCached<string[]>(supabase, cacheKey);
  if (cachedTags) {
    const validCachedTags = parseTagResult(cachedTags).filter((t) => AVAILABLE_TAGS.includes(t));
    if (validCachedTags.length === 0) throw new Error('Cached tags did not contain any supported tags.');
    await store(validCachedTags, await embed(supabase, client, recipe, ingredientText, ' (cached path)'));
    return validCachedTags;
  }

  const rl = await checkRateLimit(supabase, userId);
  if (!rl.allowed) throw new DailyLimitError(rl.limit);

  const tags = parseTagResult(await generateJson(client, modelFor(settings, 'tag'), prompt, { supabase, endpoint: 'tag', recipeId: recipe.id, userId }, {
    responseSchema: tagResponseSchema,
    // Picking from a fixed list of 23 tags is classification, and this call
    // runs after every save: it is half of what the spinner on a new card
    // waits for.
    thinking: thinkingFor('tag'),
  }));
  const validTags = tags.filter((t) => AVAILABLE_TAGS.includes(t));
  if (validTags.length === 0) throw new Error('The AI returned no supported tags.');

  await store(validTags, await embed(supabase, client, recipe, ingredientText, ''));
  setCached(supabase, cacheKey, 'tag', validTags, 24 * 30);
  return validTags;
}

/**
 * Estimates nutrition per serving, stores it, and returns it. Cached answers
 * cost none of the allowance; otherwise throws DailyLimitError when used up.
 */
export async function estimateNutrition({ supabase, client, settings, userId }: EnrichContext, recipe: RecipeText) {
  const ingredientText = ingredientLines(recipe.ingredients).join('\n');
  const prompt = buildNutritionPrompt(NUTRITION_TEMPLATE, recipe.title ?? '', ingredientText, recipe.servings ?? null);

  const store = async (nutrition: ReturnType<typeof parseNutritionResult>) => {
    const { error: updateError } = await supabase.from('recipes').update({ nutrition }).eq('id', recipe.id).eq('user_id', userId);
    if (updateError) throw updateError;
  };

  const cacheKey = makeCacheKey('nutrition', { ingredientText, servings: recipe.servings ?? null });
  const cachedNutrition = await getCached(supabase, cacheKey);
  if (cachedNutrition) {
    const nutrition = parseNutritionResult(cachedNutrition);
    await store(nutrition);
    return nutrition;
  }

  const rl = await checkRateLimit(supabase, userId);
  if (!rl.allowed) throw new DailyLimitError(rl.limit);

  const nutrition = parseNutritionResult(await generateJson(client, modelFor(settings, 'nutrition'), prompt, { supabase, endpoint: 'nutrition', recipeId: recipe.id, userId }, {
    responseSchema: nutritionResponseSchema,
    // The other half of the wait after a save. Unlike tagging this one is a
    // trade: the figures are an estimate either way and the prompt carries
    // its own calibration anchors, but reasoning may make them a little
    // steadier. If the values drift, take 'nutrition' out of REASONING_OFF_TASKS.
    thinking: thinkingFor('nutrition'),
  }));

  await store(nutrition);
  setCached(supabase, cacheKey, 'nutrition', nutrition, 24 * 30);
  return nutrition;
}
