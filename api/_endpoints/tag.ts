/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context } from 'hono';
import { ZodError } from 'zod';
import { getServerSupabase, getSettings, resolveApiKey, getUserId } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { checkRateLimit, rateLimitResponse } from './_lib/rateLimit.js';
import { tagSchema } from './_lib/schemas.js';
import { makeCacheKey, getCached, setCached } from './_lib/cache.js';
import { TAG_TEMPLATE, AVAILABLE_TAGS } from './_lib/prompts.js';

function buildTagPrompt(template: string, title: string, description: string, ingredientText: string, instructionPreview: string): string {
  return `${template}

Recipe:
Title: ${title}
Description: ${description || ''}
Ingredients: ${ingredientText}
Instructions: ${instructionPreview}`;
}

export default async function handler(c: Context) {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { recipeId, title, description, ingredients, instructions } = tagSchema.parse(body);

    const supabase = getServerSupabase();
    const userId = await getUserId(c.req.header('authorization'));
    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return c.json({ error: 'GEMINI_API_KEY is not configured.' }, 500);

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

    const template = settings.gemini_prompt_tag && settings.gemini_prompt_tag.trim()
      ? settings.gemini_prompt_tag
      : TAG_TEMPLATE;
    const prompt = buildTagPrompt(template, title, description, ingredientText, instructionPreview);

    const cacheKey = makeCacheKey('tag', { title, description: description ?? '', ingredientText, instructions: instructionPreview });
    const cachedTags = await getCached<string[]>(supabase, cacheKey);
    if (cachedTags) {
      let embedding: number[] | null = null;
      try {
        const client = getGeminiClient(apiKey);
        const embeddingText = `Title: ${title}\nDescription: ${description || ''}\nIngredients: ${ingredientText}\nInstructions: ${instructions || ''}`;
        const embedResponse = await client.models.embedContent({
          model: 'gemini-embedding-2',
          contents: embeddingText,
          config: { outputDimensionality: 768 },
        });
        if (embedResponse.embeddings?.[0]?.values) {
          embedding = embedResponse.embeddings[0].values;
        }
      } catch (embedErr) {
        console.warn('Embedding generation failed (cached path):', embedErr);
      }

      const updatePayload: Record<string, unknown> = { tags: cachedTags };
      if (embedding) updatePayload.embedding = embedding;
      await supabase.from('recipes').update(updatePayload).eq('id', recipeId);
      return c.json({ tags: cachedTags });
    }
    if (userId) { const rl = await checkRateLimit(supabase, userId); if (!rl.allowed) return rateLimitResponse(c, rl); }

    const client = getGeminiClient(apiKey);
    const tags = await generateJson<string[]>(client, settings.gemini_model, prompt, { supabase, endpoint: 'tag', recipeId, userId });
    const validTags = Array.isArray(tags) ? tags.filter((t) => AVAILABLE_TAGS.includes(t)) : [];

    let embedding: number[] | null = null;
    try {
      const embeddingText = `Title: ${title}\nDescription: ${description || ''}\nIngredients: ${ingredientText}\nInstructions: ${instructions || ''}`;
      const embedResponse = await client.models.embedContent({
        model: 'gemini-embedding-2',
        contents: embeddingText,
        config: { outputDimensionality: 768 },
      });
      if (embedResponse.embeddings?.[0]?.values) {
        embedding = embedResponse.embeddings[0].values;
      }
    } catch (embedErr) {
      console.warn('Embedding generation failed:', embedErr);
    }

    const updatePayload: Record<string, unknown> = { tags: validTags };
    if (embedding) updatePayload.embedding = embedding;
    await supabase.from('recipes').update(updatePayload).eq('id', recipeId);
    setCached(supabase, cacheKey, 'tag', validTags, 24 * 30);

    return c.json({ tags: validTags });
  } catch (err: unknown) {
    if (err instanceof ZodError) return c.json({ error: err.errors[0]?.message ?? 'Invalid request' }, 400);
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to tag recipe';
    console.error('Tagging error:', err);
    return c.json({ error: message }, 500);
  }
}
