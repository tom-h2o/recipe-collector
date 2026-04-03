import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
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

    const instructionPreview = (instructions || '').substring(0, 1000);

    const template = settings.gemini_prompt_tag && settings.gemini_prompt_tag.trim()
      ? settings.gemini_prompt_tag
      : TAG_TEMPLATE;
    const prompt = buildTagPrompt(template, title, description, ingredientText, instructionPreview);

    // Cache key based on recipe content — deterministic, 30-day TTL
    const cacheKey = makeCacheKey('tag', { title, description: description ?? '', ingredientText, instructions: instructionPreview });
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
