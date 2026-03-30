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

    const prompt = `You are an AI grocery assistant. Process the following raw ingredient list from multiple recipes into a clean shopping list.

Step 1 — Aggregate duplicates:
- Combine the same ingredient across recipes: "1 onion" + "2 onions" → "3 onions"
- Normalise units to be consistent: prefer metric (g, ml, kg, l) over imperial; prefer whole units (eggs, cans) over fractional.
- Keep reasonable precision: "425g" is fine, "424.7g" is not. Round to the nearest 5g or 10g for weights over 100g.
- Pantry staples like "salt", "pepper", "water" can be omitted — the user likely already has them. Exception: large unusual quantities (e.g. "1kg salt") should be kept.

Step 2 — Group by supermarket aisle using these exact category names:
  Produce · Meat & Fish · Dairy & Eggs · Bakery · Pasta, Rice & Grains · Canned & Jarred · Condiments & Sauces · Oils & Vinegars · Spices & Herbs · Baking · Frozen · Drinks · Other

Ingredients to process:
${ingredients.join('\n')}

Return ONLY a JSON array of objects. Only include categories that have items. Nothing else.
[
  { "category": "Produce", "items": ["3 onions", "200g cherry tomatoes"] },
  { "category": "Dairy & Eggs", "items": ["500ml whole milk", "200g cheddar"] }
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
