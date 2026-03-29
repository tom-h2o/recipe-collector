import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { scaleSchema } from './_lib/schemas.js';
import { getCached, setCached } from './_lib/cache.js';

type ScaledIngredient = { amount: string; name: string; details: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { recipeId, ingredients, currentServings, targetServings } = scaleSchema.parse(req.body);

    const supabase = getServerSupabase();

    // Cache key: recipe + exact target serving count (deterministic, 30-day TTL)
    const cacheKey = recipeId ? `scale:${recipeId}:${currentServings}:${targetServings}` : null;
    if (cacheKey) {
      const cached = await getCached<ScaledIngredient[]>(supabase, cacheKey);
      if (cached) return res.status(200).json({ ingredients: cached, cached: true });
    }

    const settings = await getSettings(supabase);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

    const ingredientText = ingredients
      .map((i) => `${i.amount ? i.amount + ' ' : ''}${i.name}${i.details ? ', ' + i.details : ''}`.trim())
      .join('\n');

    const prompt = `You are a culinary assistant. Scale this recipe from ${currentServings} to ${targetServings} servings.

Adjust each ingredient amount intelligently:
- Whole items (eggs, onions, cans, slices): always round to the nearest whole number — never write "1.5 eggs", always "1 egg" or "2 eggs"
- Small measurements: use practical fractions — 0.33 tsp → ¼ tsp, 0.67 tsp → ½ tsp, 1.33 cups → 1¼ cups
- Weights (grams, kg, oz, lbs): decimals are fine, round to the nearest 5g or 10g for cleanliness
- Very tiny scaled-down amounts: replace with "a pinch" or "to taste" where appropriate
- Keep proportions nutritionally correct even if amounts are slightly rounded

Current ingredients (${currentServings} servings):
${ingredientText}

Return ONLY a JSON array with this exact structure (no explanation, no markdown):
[
  { "amount": "2", "name": "eggs", "details": "beaten" },
  { "amount": "1¼ cups", "name": "flour", "details": "" }
]

Preserve the "details" field from the original exactly. Only change "amount".`;

    const client = getGeminiClient(apiKey);
    const scaled = await generateJson<ScaledIngredient[]>(
      client,
      settings.gemini_model,
      prompt,
      { supabase, endpoint: 'scale' },
    );

    if (cacheKey) setCached(supabase, cacheKey, 'scale', scaled, 24 * 30);

    return res.status(200).json({ ingredients: scaled, cached: false });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    }
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to scale recipe';
    console.error('Scale error:', err);
    return res.status(500).json({ error: message });
  }
}
