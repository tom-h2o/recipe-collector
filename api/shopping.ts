import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { shoppingSchema } from './_lib/schemas.js';
import { makeCacheKey, getCached, setCached } from './_lib/cache.js';
import { SHOPPING_TEMPLATE } from './_lib/prompts.js';

function buildShoppingPrompt(template: string, ingredients: string[]): string {
  return `${template}

Ingredients to process:
${ingredients.join('\n')}`;
}

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

    const template = settings.gemini_prompt_shopping && settings.gemini_prompt_shopping.trim()
      ? settings.gemini_prompt_shopping
      : SHOPPING_TEMPLATE;
    const prompt = buildShoppingPrompt(template, ingredients);

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
