import type { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateJson, EMBEDDING_MODEL } from './gemini.js';
import { modelFor, thinkingFor, type Settings } from './supabase.js';
import { nutritionResponseSchema, tagResponseSchema } from './responseSchemas.js';
import { nutritionResultSchema, tagResultSchema, MAX_SEARCH_WORDS, MAX_SEARCH_WORD_LENGTH } from './schemas.js';
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

export interface TagAnswer {
  tags: string[];
  /** German and English search words, as one line of text (recipes.search_keywords). */
  searchKeywords: string;
}

/**
 * The model's words as the text that is stored: lower case, without anything
 * that is not a letter, digit, space or hyphen, no duplicates, bounded. It is
 * model output going into a column the search reads, so nothing is trusted
 * about its size or content.
 */
export function cleanSearchWords(words: readonly string[]): string {
  const seen = new Set<string>();
  for (const raw of words) {
    const word = String(raw ?? '').toLowerCase().replace(/[^\p{L}\p{N} -]+/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!word || word.length > MAX_SEARCH_WORD_LENGTH) continue;
    seen.add(word);
    if (seen.size >= MAX_SEARCH_WORDS) break;
  }
  return [...seen].join(' ');
}

function parseTagResult(value: unknown): TagAnswer {
  const parsed = tagResultSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid AI tag output: ${parsed.error.issues[0]?.message ?? 'Invalid response'}`);
  return {
    tags: parsed.data.tags.filter((t) => AVAILABLE_TAGS.includes(t)),
    searchKeywords: cleanSearchWords(parsed.data.search_words),
  };
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
 * One reading of the recipe: its tags and its search words. Answered from the
 * cache when the same text was read before; otherwise `charge` decides whether
 * the call is taken from the person's allowance (the admin's backfill of
 * search words is not: it is maintenance, not something a person asked for).
 */
async function readTags(
  { supabase, client, settings, userId }: EnrichContext,
  recipe: RecipeText,
  ingredientText: string,
  { endpoint, charge }: { endpoint: string; charge: boolean },
): Promise<TagAnswer> {
  const instructionPreview = (recipe.instructions || '').substring(0, 1000);
  const prompt = buildTagPrompt(TAG_TEMPLATE, recipe.title, recipe.description ?? '', ingredientText, instructionPreview);

  // 'tag-v2': answers cached before search words existed are bare tag lists,
  // and serving one would leave the recipe without its search words.
  const cacheKey = makeCacheKey('tag-v2', { title: recipe.title, description: recipe.description ?? '', ingredientText, instructions: instructionPreview });
  const cached = await getCached<unknown>(supabase, cacheKey);
  if (cached) {
    const answer = parseTagResult(cached);
    if (answer.tags.length === 0) throw new Error('Cached tags did not contain any supported tags.');
    return answer;
  }

  if (charge) {
    const rl = await checkRateLimit(supabase, userId);
    if (!rl.allowed) throw new DailyLimitError(rl.limit);
  }

  const answer = parseTagResult(await generateJson(client, modelFor(settings, 'tag'), prompt, { supabase, endpoint, recipeId: recipe.id, userId }, {
    responseSchema: tagResponseSchema,
    // Picking from a fixed list of tags is classification, and this call
    // runs after every save: it is half of what the spinner on a new card
    // waits for.
    thinking: thinkingFor('tag'),
  }));
  if (answer.tags.length === 0) throw new Error('The AI returned no supported tags.');

  setCached(supabase, cacheKey, 'tag', { tags: answer.tags, search_words: answer.searchKeywords ? answer.searchKeywords.split(' ') : [] }, 24 * 30);
  return answer;
}

/**
 * Tags the recipe from the fixed list, stores the tags with an embedding and
 * the search words, and returns the tags. A cached answer costs none of the
 * allowance; otherwise throws DailyLimitError when the allowance is used up.
 */
export async function tagRecipe(ctx: EnrichContext, recipe: RecipeText): Promise<string[]> {
  const { supabase, client, userId } = ctx;
  const ingredientText = ingredientLines(recipe.ingredients).join(', ');
  const answer = await readTags(ctx, recipe, ingredientText, { endpoint: 'tag', charge: true });
  const embedding = await embed(supabase, client, recipe, ingredientText, '');

  const payload: Record<string, unknown> = { tags: answer.tags };
  if (embedding) payload.embedding = embedding;
  if (answer.searchKeywords) payload.search_keywords = answer.searchKeywords;
  let { error } = await supabase.from('recipes').update(payload).eq('id', recipe.id).eq('user_id', userId);
  if (error && isMissingSearchKeywords(error) && 'search_keywords' in payload) {
    // The minutes after a deploy before migration 0080 has run: the tags
    // must still be stored, or every new recipe would keep its spinner.
    delete payload.search_keywords;
    ({ error } = await supabase.from('recipes').update(payload).eq('id', recipe.id).eq('user_id', userId));
  }
  if (error) throw error;
  return answer.tags;
}

function isMissingSearchKeywords(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST204' || error.code === '42703' || /search_keywords/.test(error.message ?? '');
}

/**
 * Search words for a recipe that was tagged before they existed. Stores only
 * the words: its tags are left alone, since the owner may have edited them.
 * Returns false when the model gave none.
 */
export async function addSearchWords(ctx: EnrichContext, recipe: RecipeText): Promise<boolean> {
  const ingredientText = ingredientLines(recipe.ingredients).join(', ');
  const answer = await readTags(ctx, recipe, ingredientText, { endpoint: 'search-words', charge: false });
  // An empty answer is stored as a single space, so the recipe is not asked
  // about again on every run of the backfill.
  const { error } = await ctx.supabase.from('recipes').update({ search_keywords: answer.searchKeywords || ' ' }).eq('id', recipe.id);
  if (error) throw error;
  return answer.searchKeywords.length > 0;
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
