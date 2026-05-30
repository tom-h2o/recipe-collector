import type { Context } from 'hono';
import { ZodError } from 'zod';
import { getServerSupabase, getSettings, resolveApiKey, getUserId } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { checkRateLimit, rateLimitResponse } from './_lib/rateLimit.js';
import { nutritionSchema } from './_lib/schemas.js';
import { makeCacheKey, getCached, setCached } from './_lib/cache.js';
import { NUTRITION_TEMPLATE } from './_lib/prompts.js';

function buildNutritionPrompt(template: string, title: string, ingredientText: string, servings: number | null): string {
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

export default async function handler(c: Context) {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { recipeId, title, ingredients, servings } = nutritionSchema.parse(body);

    const supabase = getServerSupabase();
    const userId = await getUserId(c.req.header('authorization'));
    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return c.json({ error: 'GEMINI_API_KEY not configured.' }, 500);

    const ingredientText = Array.isArray(ingredients)
      ? ingredients.map((i: unknown) => {
          if (typeof i === 'object' && i !== null && 'name' in i) {
            const ing = i as { amount?: string; name: string };
            return `${ing.amount || ''} ${ing.name}`.trim();
          }
          return String(i);
        }).join('\n')
      : String(ingredients);

    const template = settings.gemini_prompt_nutrition && settings.gemini_prompt_nutrition.trim()
      ? settings.gemini_prompt_nutrition
      : NUTRITION_TEMPLATE;
    const prompt = buildNutritionPrompt(template, title, ingredientText, servings);

    const cacheKey = makeCacheKey('nutrition', { ingredientText, servings: servings ?? null });
    const cachedNutrition = await getCached(supabase, cacheKey);
    if (cachedNutrition) {
      await supabase.from('recipes').update({ nutrition: cachedNutrition }).eq('id', recipeId);
      return c.json({ nutrition: cachedNutrition });
    }
    if (userId) { const rl = await checkRateLimit(supabase, userId); if (!rl.allowed) return rateLimitResponse(c, rl); }

    const client = getGeminiClient(apiKey);
    const nutrition = await generateJson(client, settings.gemini_model, prompt, { supabase, endpoint: 'nutrition', recipeId, userId });

    await supabase.from('recipes').update({ nutrition }).eq('id', recipeId);
    setCached(supabase, cacheKey, 'nutrition', nutrition, 24 * 30);

    return c.json({ nutrition });
  } catch (err: unknown) {
    if (err instanceof ZodError) return c.json({ error: err.errors[0]?.message ?? 'Invalid request' }, 400);
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to estimate nutrition';
    console.error('Nutrition error:', err);
    return c.json({ error: message }, 500);
  }
}
