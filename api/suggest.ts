/* eslint-disable @typescript-eslint/no-explicit-any */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey, getUserId } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { suggestSchema } from './_lib/schemas.js';
import { makeCacheKey, getCached, setCached } from './_lib/cache.js';
import { SUGGEST_TEMPLATE } from './_lib/prompts.js';
import { checkRateLimit } from './_lib/rateLimit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { ingredients: userIngredients } = suggestSchema.parse(req.body);
    const supabase = getServerSupabase();
    const userId = await getUserId(req.headers.authorization as string | undefined);
    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

    let queryEmbedding: number[] | null = null;
    let vectorRecipes: any[] = [];
    try {
      const client = getGeminiClient(apiKey);
      const embedResponse = await client.models.embedContent({ model: 'gemini-embedding-2', contents: `Available ingredients: ${userIngredients.join(', ')}`, config: { outputDimensionality: 768 } });
      if (embedResponse.embeddings?.[0]?.values) queryEmbedding = embedResponse.embeddings[0].values;
      if (queryEmbedding && userId) {
        const { data: matchedVector } = await supabase.rpc('match_recipes', { query_embedding: queryEmbedding, match_threshold: 0.1, match_count: 30, filter_user_id: userId });
        if (matchedVector && matchedVector.length > 0) vectorRecipes = matchedVector;
      }
    } catch (vectorErr) {
      console.warn('Vector similarity search failed, using fallback:', vectorErr);
    }

    let topCandidates: any[] = [];
    if (vectorRecipes.length > 0) {
      topCandidates = vectorRecipes.map((r) => ({ recipe: r, ingredientsText: Array.isArray(r.ingredients) ? r.ingredients.map((i: any) => (typeof i === 'object' && i !== null && 'name' in i ? (i as { name: string }).name : String(i))).join(', ') : String(r.ingredients ?? '') }));
    } else {
      const { data: recipes } = await supabase.from('recipes').select('id, title, ingredients').order('created_at', { ascending: false }).limit(200);
      if (!recipes || recipes.length === 0) return res.status(200).json({ suggestions: [] });
      const scored = recipes.map((r) => {
        const ingList = Array.isArray(r.ingredients) ? r.ingredients.map((i: unknown) => (typeof i === 'object' && i !== null && 'name' in i ? (i as { name: string }).name : String(i))) : [];
        const lower = ingList.map((n: string) => n.toLowerCase());
        let matches = 0;
        for (const userIng of userIngredients) {
          const q = userIng.toLowerCase().trim();
          if (q && lower.some((ing: string) => ing.includes(q) || q.includes(ing))) matches++;
        }
        return { recipe: r, score: matches, ingredientsText: ingList.join(', ') };
      });
      topCandidates = scored.filter((c) => c.score > 0 || scored.length <= 30).sort((a, b) => b.score - a.score).slice(0, 30);
    }

    if (topCandidates.length === 0) return res.status(200).json({ suggestions: [] });

    const recipeList = topCandidates.map((c) => `ID: ${c.recipe.id} | Title: ${c.recipe.title} | Ingredients: ${c.ingredientsText}`).join('\n');
    const prompt = `${SUGGEST_TEMPLATE}\n\nThe user currently has these ingredients: ${userIngredients.join(', ')}\n\nHere are the recipes in their collection:\n${recipeList}`;

    const cacheKey = makeCacheKey('suggest', userIngredients);
    const cachedIds = await getCached<string[]>(supabase, cacheKey);

    let validIds: string[];
    if (cachedIds) {
      validIds = cachedIds;
    } else {
      if (userId) {
        const rl = await checkRateLimit(supabase, userId);
        if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });
      }
      const client = getGeminiClient(apiKey);
      const suggestedIds = await generateJson<string[]>(client, settings.gemini_model, prompt, { supabase, endpoint: 'suggest', userId });
      validIds = Array.isArray(suggestedIds) ? suggestedIds : [];
      setCached(supabase, cacheKey, 'suggest', validIds, 1);
    }

    const { data: matchedRecipes } = await supabase.from('recipes').select('*').in('id', validIds);
    return res.status(200).json({ suggestions: matchedRecipes ?? [] });
  } catch (err: unknown) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    captureException(err);
    console.error('Suggest error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to suggest recipes' });
  }
}
