import type { Context } from 'hono';
import { ZodError } from 'zod';
import { getServerSupabase, getSettings, resolveApiKey, getUserId } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { checkRateLimit, rateLimitResponse } from './_lib/rateLimit.js';
import { shoppingSchema } from './_lib/schemas.js';
import { makeCacheKey, getCached, setCached } from './_lib/cache.js';
import { SHOPPING_TEMPLATE } from './_lib/prompts.js';

function buildShoppingPrompt(template: string, ingredients: string[]): string {
  return `${template}

Ingredients to process:
${ingredients.join('\n')}`;
}

export default async function handler(c: Context) {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { ingredients } = shoppingSchema.parse(body);

    const supabase = getServerSupabase();
    const userId = await getUserId(c.req.header('authorization'));
    if (userId) { const rl = await checkRateLimit(supabase, userId); if (!rl.allowed) return rateLimitResponse(c, rl); }
    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return c.json({ error: 'GEMINI_API_KEY not configured.' }, 500);

    const template = settings.gemini_prompt_shopping && settings.gemini_prompt_shopping.trim()
      ? settings.gemini_prompt_shopping
      : SHOPPING_TEMPLATE;
    const prompt = buildShoppingPrompt(template, ingredients);

    const cacheKey = makeCacheKey('shopping', ingredients);
    const cachedList = await getCached(supabase, cacheKey);
    if (cachedList) return c.json({ list: cachedList });

    const client = getGeminiClient(apiKey);
    const list = await generateJson(client, settings.gemini_model, prompt, { supabase, endpoint: 'shopping', userId });
    setCached(supabase, cacheKey, 'shopping', list, 24);
    return c.json({ list });
  } catch (err: unknown) {
    if (err instanceof ZodError) return c.json({ error: err.errors[0]?.message ?? 'Invalid request' }, 400);
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to generate shopping list';
    console.error('Shopping list error:', err);
    return c.json({ error: message }, 500);
  }
}
