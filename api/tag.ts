import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { tagSchema } from './_lib/schemas.js';
import { makeCacheKey, getCached, setCached } from './_lib/cache.js';

const AVAILABLE_TAGS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free',
  'High Protein', 'Low Carb', 'Quick (<30min)', 'Comfort Food',
  'Italian', 'Asian', 'Mexican', 'Mediterranean', 'Indian', 'American',
  'Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack', 'Soup',
  'Baking', 'Grilling', 'One-Pot',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { recipeId, title, description, ingredients, instructions } = tagSchema.parse(req.body);

    const supabase = getServerSupabase();
    const settings = await getSettings(supabase);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

    const ingredientText = Array.isArray(ingredients)
      ? ingredients.map((i: unknown) => {
          if (typeof i === 'object' && i !== null && 'name' in i) {
            const ing = i as { amount?: string; name: string };
            return `${ing.amount || ''} ${ing.name}`.trim();
          }
          return String(i);
        }).join(', ')
      : String(ingredients ?? '');

    const prompt = `You are a recipe categorisation assistant.
Given the following recipe, select ONLY the most relevant tags from this list:
${AVAILABLE_TAGS.join(', ')}

Rules:
- Select 2–5 tags maximum.
- Only use tags from the provided list.
- Return a JSON array of strings, nothing else. Example: ["Italian", "Quick (<30min)", "Vegetarian"]

Recipe:
Title: ${title}
Description: ${description || ''}
Ingredients: ${ingredientText}
Instructions: ${(instructions || '').substring(0, 500)}`;

    // Cache key based on recipe content — deterministic, 30-day TTL
    const cacheKey = makeCacheKey('tag', { title, description: description ?? '', ingredientText, instructions: (instructions ?? '').substring(0, 500) });
    const cachedTags = await getCached<string[]>(supabase, cacheKey);
    if (cachedTags) {
      await supabase.from('recipes').update({ tags: cachedTags }).eq('id', recipeId);
      return res.status(200).json({ tags: cachedTags });
    }

    const client = getGeminiClient(apiKey);
    const tags = await generateJson<string[]>(client, settings.gemini_model, prompt, { supabase, endpoint: 'tag', recipeId });
    const validTags = Array.isArray(tags) ? tags.filter((t) => AVAILABLE_TAGS.includes(t)) : [];

    await supabase.from('recipes').update({ tags: validTags }).eq('id', recipeId);
    setCached(supabase, cacheKey, 'tag', validTags, 24 * 30); // 30 days

    return res.status(200).json({ tags: validTags });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    }
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to tag recipe';
    console.error('Tagging error:', err);
    return res.status(500).json({ error: message });
  }
}
