import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey, getUserId, canEditRecipe } from './_lib/supabase.js';
import { getGeminiClient, describeGeminiError } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { nutritionSchema } from './_lib/schemas.js';
import { DailyLimitError, estimateNutrition } from './_lib/enrich.js';

/**
 * Estimates nutrition for a recipe the app has just saved. The work itself is
 * estimateNutrition() in _lib/enrich.ts, shared with the iPhone Shortcut
 * import, which saves and estimates on the server.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { recipeId, title, ingredients, servings } = nutritionSchema.parse(req.body);

    const supabase = getServerSupabase();
    const userId = await getUserId(req.headers.authorization as string | undefined);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!await canEditRecipe(supabase, recipeId, userId)) return res.status(403).json({ error: 'Forbidden' });
    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

    const nutrition = await estimateNutrition(
      { supabase, client: getGeminiClient(apiKey), settings, userId },
      { id: recipeId, title: title ?? '', ingredients, servings: servings ?? null },
    );
    return res.status(200).json({ nutrition });
  } catch (err: unknown) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
    if (err instanceof DailyLimitError) return res.status(429).json({ error: err.message });
    captureException(err);
    console.error('Nutrition error:', err);
    // Never pass err.message through: for a Gemini failure that is the raw
    // API envelope, which reads as though the user's recipe is at fault.
    const described = describeGeminiError(err, 'Failed to estimate nutrition');
    return res.status(described.status).json({ error: described.message });
  }
}
