import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey, getUserId, canEditRecipe } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { tagResultSchema, tagSchema } from './_lib/schemas.js';
import { makeCacheKey, getCached, setCached } from './_lib/cache.js';
import { TAG_TEMPLATE, AVAILABLE_TAGS } from './_lib/prompts.js';
import { checkRateLimit } from './_lib/rateLimit.js';

function parseTagResult(value: unknown): string[] {
  const parsed = tagResultSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid Gemini tag output: ${parsed.error.issues[0]?.message ?? 'Invalid response'}`);
  return parsed.data;
}

function buildTagPrompt(template: string, title: string, description: string, ingredientText: string, instructionPreview: string): string {
  return `${template}

Recipe:
Title: ${title}
Description: ${description || ''}
Ingredients: ${ingredientText}
Instructions: ${instructionPreview}`;
}

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

    const ingredientText = Array.isArray(ingredients)
      ? ingredients.map((i: unknown) => {
          if (typeof i === 'object' && i !== null && 'name' in i) {
            const ing = i as { amount?: string; name: string };
            return `${ing.amount || ''} ${ing.name}`.trim();
          }
          return String(i);
        }).join(', ')
      : String(ingredients ?? '');

    const instructionPreview = (instructions || '').substring(0, 1000);
    const prompt = buildTagPrompt(TAG_TEMPLATE, title, description ?? '', ingredientText, instructionPreview);

    const cacheKey = makeCacheKey('tag', { title, description: description ?? '', ingredientText, instructions: instructionPreview });
    const cachedTags = await getCached<string[]>(supabase, cacheKey);
    if (cachedTags) {
      const validCachedTags = parseTagResult(cachedTags).filter((t) => AVAILABLE_TAGS.includes(t));
      if (validCachedTags.length === 0) throw new Error('Cached tags did not contain any supported tags.');
      let embedding: number[] | null = null;
      try {
        const client = getGeminiClient(apiKey);
        const embedResponse = await client.models.embedContent({
          model: 'gemini-embedding-2',
          contents: `Title: ${title}\nDescription: ${description || ''}\nIngredients: ${ingredientText}\nInstructions: ${instructions || ''}`,
          config: { outputDimensionality: 768 },
        });
        if (embedResponse.embeddings?.[0]?.values) embedding = embedResponse.embeddings[0].values;
      } catch (embedErr) {
        console.warn('Embedding generation failed (cached path):', embedErr);
      }
      const updatePayload: Record<string, unknown> = { tags: validCachedTags };
      if (embedding) updatePayload.embedding = embedding;
      const { error: updateError } = await supabase.from('recipes').update(updatePayload).eq('id', recipeId).eq('user_id', userId);
      if (updateError) throw updateError;
      return res.status(200).json({ tags: validCachedTags });
    }

    const rl = await checkRateLimit(supabase, userId);
    if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });

    const client = getGeminiClient(apiKey);
    const tags = parseTagResult(await generateJson(client, settings.gemini_model, prompt, { supabase, endpoint: 'tag', recipeId, userId }));
    const validTags = tags.filter((t) => AVAILABLE_TAGS.includes(t));
    if (validTags.length === 0) throw new Error('Gemini returned no supported tags.');

    let embedding: number[] | null = null;
    try {
      const embedResponse = await client.models.embedContent({
        model: 'gemini-embedding-2',
        contents: `Title: ${title}\nDescription: ${description || ''}\nIngredients: ${ingredientText}\nInstructions: ${instructions || ''}`,
        config: { outputDimensionality: 768 },
      });
      if (embedResponse.embeddings?.[0]?.values) embedding = embedResponse.embeddings[0].values;
    } catch (embedErr) {
      console.warn('Embedding generation failed:', embedErr);
    }

    const updatePayload: Record<string, unknown> = { tags: validTags };
    if (embedding) updatePayload.embedding = embedding;
    const { error: updateError } = await supabase.from('recipes').update(updatePayload).eq('id', recipeId).eq('user_id', userId);
    if (updateError) throw updateError;
    setCached(supabase, cacheKey, 'tag', validTags, 24 * 30);

    return res.status(200).json({ tags: validTags });
  } catch (err: unknown) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
    captureException(err);
    console.error('Tagging error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to tag recipe' });
  }
}
