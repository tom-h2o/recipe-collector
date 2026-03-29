import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { shoppingSchema } from './_lib/schemas.js';
import { makeCacheKey, getCached, setCached } from './_lib/cache.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { ingredients } = shoppingSchema.parse(req.body);

    const supabase = getServerSupabase();
    const settings = await getSettings(supabase);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

    const prompt = `You are an AI grocery assistant.
Take the following list of raw ingredients from various recipes.
1. Aggregate any duplicate ingredients (e.g., "1 onion" and "2 onions" becomes "3 onions"). Convert units to be consistent if necessary.
2. Group the aggregated ingredients into logical supermarket aisles/categories (e.g., "Produce", "Dairy & Eggs", "Meat", "Pantry", etc.).

Ingredients to process:
${ingredients.join('\n')}

Return ONLY a JSON array of objects with the following structure, and nothing else.
[
  {
    "category": "Produce",
    "items": ["3 onions", "1 bunch basil"]
  },
  {
    "category": "Dairy",
    "items": ["500ml milk", "200g cheddar"]
  }
]`;

    // 24-hour TTL — same ingredient list should produce the same grouping
    const cacheKey = makeCacheKey('shopping', ingredients);
    const cachedList = await getCached(supabase, cacheKey);
    if (cachedList) {
      return res.status(200).json({ list: cachedList });
    }

    const client = getGeminiClient(apiKey);
    const list = await generateJson(client, settings.gemini_model, prompt, { supabase, endpoint: 'shopping' });
    setCached(supabase, cacheKey, 'shopping', list, 24);
    return res.status(200).json({ list });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    }
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to generate shopping list';
    console.error('Shopping list error:', err);
    return res.status(500).json({ error: message });
  }
}
