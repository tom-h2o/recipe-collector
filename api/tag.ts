import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey, getUserId, canEditRecipe } from './_lib/supabase.js';
import { getGeminiClient, describeGeminiError } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { tagSchema } from './_lib/schemas.js';
import { DailyLimitError, tagRecipe } from './_lib/enrich.js';

/**
 * Tags a recipe the app has just saved. The work itself is tagRecipe() in
 * _lib/enrich.ts, shared with the iPhone Shortcut import, which saves and tags
 * on the server.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { recipeId, title, description, ingredients, instructions } = tagSchema.parse(req.body);

    const supabase = getServerSupabase();
    const userId = await getUserId(req.headers.authorization as string | undefined);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!await canEditRecipe(supabase, recipeId, userId)) return res.status(403).json({ error: 'Forbidden' });
    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

    const tags = await tagRecipe(
      { supabase, client: getGeminiClient(apiKey), settings, userId },
      { id: recipeId, title, description, ingredients, instructions },
    );
    return res.status(200).json({ tags });
  } catch (err: unknown) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
    if (err instanceof DailyLimitError) return res.status(429).json({ error: err.message });
    captureException(err);
    console.error('Tagging error:', err);
    // Never pass err.message through: for a Gemini failure that is the raw
    // API envelope, which reads as though the user's recipe is at fault.
    const described = describeGeminiError(err, 'Failed to tag recipe');
    return res.status(described.status).json({ error: described.message });
  }
}
