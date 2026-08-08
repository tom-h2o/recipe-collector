import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey, getUserId } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { shoppingResultSchema, shoppingSchema } from './_lib/schemas.js';
import { makeCacheKey, getCached, setCached } from './_lib/cache.js';
import { SHOPPING_TEMPLATE } from './_lib/prompts.js';
import { checkRateLimit } from './_lib/rateLimit.js';

function parseShoppingResult(value: unknown) {
  const parsed = shoppingResultSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid Gemini shopping output: ${parsed.error.issues[0]?.message ?? 'Invalid response'}`);
  return parsed.data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { ingredients } = shoppingSchema.parse(req.body);

    const supabase = getServerSupabase();
    const userId = await getUserId(req.headers.authorization as string | undefined);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

    const template = settings.gemini_prompt_shopping?.trim() ? settings.gemini_prompt_shopping : SHOPPING_TEMPLATE;
    const prompt = `${template}\n\nIngredients to process:\n${ingredients.join('\n')}`;

    const cacheKey = makeCacheKey('shopping', ingredients);
    const cachedList = await getCached(supabase, cacheKey);
    if (cachedList) return res.status(200).json({ list: parseShoppingResult(cachedList) });

    const rl = await checkRateLimit(supabase, userId);
    if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });

    const client = getGeminiClient(apiKey);
    const list = parseShoppingResult(await generateJson(client, settings.gemini_model, prompt, { supabase, endpoint: 'shopping', userId }));
    setCached(supabase, cacheKey, 'shopping', list, 24);
    return res.status(200).json({ list });
  } catch (err: unknown) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
    captureException(err);
    console.error('Shopping list error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate shopping list' });
  }
}
