import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey, getUserId } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { translateSchema } from './_lib/schemas.js';
import { TRANSLATE_TEMPLATE } from './_lib/prompts.js';
import { checkRateLimit } from './_lib/rateLimit.js';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', de: 'German', fr: 'French', es: 'Spanish', pl: 'Polish' };

interface TranslationResult {
  detectedSourceLanguage?: unknown;
  title: unknown;
  description: unknown;
  instructions: unknown;
  ingredients: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { recipeId, targetLanguage, title, description, instructions, ingredients } = translateSchema.parse(req.body);
    const supabase = getServerSupabase();
    const userId = await getUserId(req.headers.authorization as string | undefined);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: existing } = await supabase.from('recipe_translations').select('*').eq('recipe_id', recipeId).eq('language_code', targetLanguage).single();
    if (existing) return res.status(200).json({ ...existing, cached: true });

    const rl = await checkRateLimit(supabase, userId);
    if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });

    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

    const targetName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;
    const ingredientText = JSON.stringify(ingredients.map((i) => ({ amount: i.amount, name: i.name, details: i.details ?? '' })));
    const template = settings.gemini_prompt_translate?.trim() ? settings.gemini_prompt_translate : TRANSLATE_TEMPLATE;
    const prompt = `${template} Translate the following recipe into ${targetName}.

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
    const result = await generateJson<TranslationResult>(client, settings.gemini_model, prompt, { supabase, endpoint: 'translate', recipeId, userId });

    const safeTitle = typeof result.title === 'string' ? result.title : String(result.title ?? title);
    const safeDescription = typeof result.description === 'string' ? result.description : Array.isArray(result.description) ? result.description.join(' ') : String(result.description ?? '');
    const safeInstructions = typeof result.instructions === 'string' ? result.instructions : Array.isArray(result.instructions) ? result.instructions.join('\n') : String(result.instructions ?? instructions);
    const safeIngredients = Array.isArray(result.ingredients) ? result.ingredients.map((i: Record<string, unknown>) => ({ amount: String(i?.amount ?? ''), name: String(i?.name ?? ''), details: String(i?.details ?? '') })) : ingredients.map((i) => ({ amount: i.amount, name: i.name, details: i.details ?? '' }));

    const row = { recipe_id: recipeId, language_code: targetLanguage, title: safeTitle, description: safeDescription, instructions: safeInstructions, ingredients: safeIngredients };
    await supabase.from('recipe_translations').upsert(row, { onConflict: 'recipe_id,language_code' });

    const detectedLang = typeof result.detectedSourceLanguage === 'string' ? result.detectedSourceLanguage : undefined;
    if (detectedLang) supabase.from('recipes').update({ original_language: detectedLang }).eq('id', recipeId).then(() => {}, () => {});

    return res.status(200).json({ ...row, detectedSourceLanguage: detectedLang, cached: false });
  } catch (err: unknown) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
    captureException(err);
    console.error('Translate error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to translate recipe' });
  }
}
