import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { recipeId, title, ingredients, servings } = nutritionSchema.parse(req.body);

    const supabase = getServerSupabase();
    const settings = await getSettings(supabase);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

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

    // Cache key based on ingredients + servings — deterministic, 30-day TTL
    const cacheKey = makeCacheKey('nutrition', { ingredientText, servings: servings ?? null });
    const cachedNutrition = await getCached(supabase, cacheKey);
    if (cachedNutrition) {
      await supabase.from('recipes').update({ nutrition: cachedNutrition }).eq('id', recipeId);
      return res.status(200).json({ nutrition: cachedNutrition });
    }

    const client = getGeminiClient(apiKey);
    const nutrition = await generateJson(client, settings.gemini_model, prompt, { supabase, endpoint: 'nutrition', recipeId });

    await supabase.from('recipes').update({ nutrition }).eq('id', recipeId);
    setCached(supabase, cacheKey, 'nutrition', nutrition, 24 * 30); // 30 days

    return res.status(200).json({ nutrition });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    }
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to estimate nutrition';
    console.error('Nutrition error:', err);
    return res.status(500).json({ error: message });
  }
}
