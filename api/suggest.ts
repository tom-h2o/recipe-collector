import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { suggestSchema } from './_lib/schemas.js';
import { makeCacheKey, getCached, setCached } from './_lib/cache.js';

function getDefaultSuggestPrompt(userIngredients: string[], recipeList: string): string {
  return `You are a cooking assistant helping a user decide what to cook tonight.

The user currently has these ingredients: ${userIngredients.join(', ')}

Here are the recipes in their collection:
${recipeList}

Task: rank these recipes by how well they match the available ingredients.

Scoring guidance:
- A recipe scores high if the user has most or all of the required ingredients.
- Pantry staples (salt, pepper, water, oil, butter, basic spices) can be assumed to always be available even if not listed.
- Penalise recipes that require many speciality ingredients the user has not listed.
- Return at most 5 recipe IDs, ranked best-match first.

Return ONLY a JSON array of recipe ID strings (best match first), nothing else. Example: ["uuid-1", "uuid-2"]`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { ingredients: userIngredients } = suggestSchema.parse(req.body);

    const supabase = getServerSupabase();
    const settings = await getSettings(supabase);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

    // Fetch only the 50 most recent recipes — title + ingredients only (not full *)
    const { data: recipes } = await supabase
      .from('recipes')
      .select('id, title, ingredients')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!recipes || recipes.length === 0) {
      return res.status(200).json({ suggestions: [] });
    }

    const recipeList = recipes
      .map((r) => {
        const ingList = Array.isArray(r.ingredients)
          ? r.ingredients
              .map((i: unknown) => {
                if (typeof i === 'object' && i !== null && 'name' in i) {
                  return (i as { name: string }).name;
                }
                return String(i);
              })
              .join(', ')
          : '';
        return `ID: ${r.id} | Title: ${r.title} | Ingredients: ${ingList}`;
      })
      .join('\n');

    const prompt = settings.gemini_prompt_suggest && settings.gemini_prompt_suggest.trim()
      ? settings.gemini_prompt_suggest
      : getDefaultSuggestPrompt(userIngredients, recipeList);

    // Short 1-hour TTL — results depend on the recipe library which changes over time
    const cacheKey = makeCacheKey('suggest', userIngredients);
    const cachedIds = await getCached<string[]>(supabase, cacheKey);

    let validIds: string[];
    if (cachedIds) {
      validIds = cachedIds;
    } else {
      const client = getGeminiClient(apiKey);
      const suggestedIds = await generateJson<string[]>(client, settings.gemini_model, prompt, { supabase, endpoint: 'suggest' });
      validIds = Array.isArray(suggestedIds) ? suggestedIds : [];
      setCached(supabase, cacheKey, 'suggest', validIds, 1);
    }

    // Fetch full recipe data for matched IDs
    const { data: matchedRecipes } = await supabase
      .from('recipes')
      .select('*')
      .in('id', validIds);

    return res.status(200).json({ suggestions: matchedRecipes ?? [] });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    }
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to suggest recipes';
    console.error('Suggest error:', err);
    return res.status(500).json({ error: message });
  }
}
