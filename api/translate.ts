import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey, getUserId, userOwnsRecipe } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { translationResultSchema, translateSchema } from './_lib/schemas.js';
import { TRANSLATE_TEMPLATE } from './_lib/prompts.js';
import { checkRateLimit } from './_lib/rateLimit.js';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', de: 'German', fr: 'French', es: 'Spanish', pl: 'Polish' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { recipeId, targetLanguage, title, description, instructions, ingredients } = translateSchema.parse(req.body);
    const supabase = getServerSupabase();
    const userId = await getUserId(req.headers.authorization as string | undefined);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!await userOwnsRecipe(supabase, recipeId, userId)) return res.status(403).json({ error: 'Forbidden' });

    const { data: existing } = await supabase.from('recipe_translations').select('*').eq('recipe_id', recipeId).eq('language_code', targetLanguage).single();
    if (existing) return res.status(200).json({ ...existing, cached: true });

    const rl = await checkRateLimit(supabase, userId);
    if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });

    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

    const targetName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;
    const ingredientText = JSON.stringify(ingredients.map((i) => ({ amount: i.amount, name: i.name, details: i.details ?? '' })));
    const prompt = `${TRANSLATE_TEMPLATE} Translate the following recipe into ${targetName}.

Input recipe:
{
  "title": ${JSON.stringify(title)},
  "description": ${JSON.stringify(description)},
  "instructions": ${JSON.stringify(instructions)},
  "ingredients": ${ingredientText}
}

Return this exact JSON structure:
{
  "detectedSourceLanguage": "en",
  "title": "...",
  "description": "...",
  "instructions": "...",
  "ingredients": [{ "amount": "...", "name": "...", "details": "..." }]
}`;

    const client = getGeminiClient(apiKey);
    const result = translationResultSchema.parse(
      await generateJson(client, settings.gemini_model, prompt, { supabase, endpoint: 'translate', recipeId, userId }),
    );

    const row = { recipe_id: recipeId, language_code: targetLanguage, title: result.title, description: result.description, instructions: result.instructions, ingredients: result.ingredients };
    const { error: upsertError } = await supabase.from('recipe_translations').upsert(row, { onConflict: 'recipe_id,language_code' });
    if (upsertError) throw upsertError;

    const detectedLang = result.detectedSourceLanguage;
    if (detectedLang) supabase.from('recipes').update({ original_language: detectedLang }).eq('id', recipeId).eq('user_id', userId).then(() => {}, () => {});

    return res.status(200).json({ ...row, detectedSourceLanguage: detectedLang, cached: false });
  } catch (err: unknown) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
    captureException(err);
    console.error('Translate error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to translate recipe' });
  }
}
