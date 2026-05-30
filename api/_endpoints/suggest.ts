/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context } from 'hono';
import { ZodError } from 'zod';
import { getServerSupabase, getSettings, resolveApiKey, getUserId } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { checkRateLimit, rateLimitResponse } from './_lib/rateLimit.js';
import { suggestSchema } from './_lib/schemas.js';
import { makeCacheKey, getCached, setCached } from './_lib/cache.js';
import { SUGGEST_TEMPLATE } from './_lib/prompts.js';

function buildSuggestPrompt(template: string, userIngredients: string[], recipeList: string): string {
  return `${template}

The user currently has these ingredients: ${userIngredients.join(', ')}

Here are the recipes in their collection:
${recipeList}`;
}

export default async function handler(c: Context) {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { ingredients: userIngredients } = suggestSchema.parse(body);

    const supabase = getServerSupabase();
    const userId = await getUserId(c.req.header('authorization'));
    if (userId) { const rl = await checkRateLimit(supabase, userId); if (!rl.allowed) return rateLimitResponse(c, rl); }
    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return c.json({ error: 'GEMINI_API_KEY not configured.' }, 500);

    let queryEmbedding: number[] | null = null;
    let vectorRecipes: any[] = [];
    try {
      const client = getGeminiClient(apiKey);
      const embedResponse = await client.models.embedContent({
        model: 'gemini-embedding-2',
        contents: `Available ingredients: ${userIngredients.join(', ')}`,
        config: { outputDimensionality: 768 },
      });
      if (embedResponse.embeddings?.[0]?.values) {
        queryEmbedding = embedResponse.embeddings[0].values;
      }

      if (queryEmbedding && userId) {
        const { data: matchedVector } = await supabase.rpc('match_recipes', {
          query_embedding: queryEmbedding,
          match_threshold: 0.1,
          match_count: 30,
          filter_user_id: userId,
        });
        if (matchedVector && matchedVector.length > 0) {
          vectorRecipes = matchedVector;
        }
      }
    } catch (vectorErr) {
      console.warn('Vector similarity search failed or pgvector not set up, using fallback:', vectorErr);
    }

    let topCandidates: any[] = [];
    if (vectorRecipes.length > 0) {
      topCandidates = vectorRecipes.map((r) => ({
        recipe: r,
        ingredientsText: Array.isArray(r.ingredients)
          ? r.ingredients.map((i: any) => {
              if (typeof i === 'object' && i !== null && 'name' in i) {
                return (i as { name: string }).name;
              }
              return String(i);
            }).join(', ')
          : String(r.ingredients ?? ''),
      }));
    } else {
      const { data: recipes } = await supabase
        .from('recipes')
        .select('id, title, ingredients')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!recipes || recipes.length === 0) return c.json({ suggestions: [] });

      const scoredCandidates = recipes.map((r) => {
        const ingList = Array.isArray(r.ingredients)
          ? r.ingredients.map((i: unknown) => {
              if (typeof i === 'object' && i !== null && 'name' in i) {
                return (i as { name: string }).name;
              }
              return String(i);
            })
          : [];

        let matches = 0;
        const lowerIngList = ingList.map((name: string) => name.toLowerCase());

        for (const userIng of userIngredients) {
          const query = userIng.toLowerCase().trim();
          if (!query) continue;
          if (lowerIngList.some((ing: string) => ing.includes(query) || query.includes(ing))) {
            matches += 1;
          }
        }

        return { recipe: r, score: matches, ingredientsText: ingList.join(', ') };
      });

      topCandidates = scoredCandidates
        .filter((c) => c.score > 0 || scoredCandidates.length <= 30)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);
    }

    if (topCandidates.length === 0) return c.json({ suggestions: [] });

    const recipeList = topCandidates
      .map((c) => `ID: ${c.recipe.id} | Title: ${c.recipe.title} | Ingredients: ${c.ingredientsText}`)
      .join('\n');

    const template = settings.gemini_prompt_suggest && settings.gemini_prompt_suggest.trim()
      ? settings.gemini_prompt_suggest
      : SUGGEST_TEMPLATE;
    const prompt = buildSuggestPrompt(template, userIngredients, recipeList);

    const cacheKey = makeCacheKey('suggest', userIngredients);
    const cachedIds = await getCached<string[]>(supabase, cacheKey);

    let validIds: string[];
    if (cachedIds) {
      validIds = cachedIds;
    } else {
      const client = getGeminiClient(apiKey);
      const suggestedIds = await generateJson<string[]>(client, settings.gemini_model, prompt, { supabase, endpoint: 'suggest', userId });
      validIds = Array.isArray(suggestedIds) ? suggestedIds : [];
      setCached(supabase, cacheKey, 'suggest', validIds, 1);
    }

    const { data: matchedRecipes } = await supabase
      .from('recipes')
      .select('*')
      .in('id', validIds);

    return c.json({ suggestions: matchedRecipes ?? [] });
  } catch (err: unknown) {
    if (err instanceof ZodError) return c.json({ error: err.errors[0]?.message ?? 'Invalid request' }, 400);
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to suggest recipes';
    console.error('Suggest error:', err);
    return c.json({ error: message }, 500);
  }
}
