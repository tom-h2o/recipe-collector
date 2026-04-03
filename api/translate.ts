import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { translateSchema } from './_lib/schemas.js';
import { TRANSLATE_TEMPLATE } from './_lib/prompts.js';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  pl: 'Polish',
};

type TranslatedIngredient = { amount: string; name: string; details?: string };

interface TranslationResult {
  detectedSourceLanguage: string;
  title: string;
  description: string;
  instructions: string;
  ingredients: TranslatedIngredient[];
}


function buildTranslatePrompt(template: string, targetName: string, title: string, description: string, instructions: string, ingredientText: string): string {
  return `${template} Translate the following recipe into ${targetName}.

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
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { recipeId, targetLanguage, title, description, instructions, ingredients } =
      translateSchema.parse(req.body);

    const supabase = getServerSupabase();

    // Check DB cache first — translations are permanent once generated
    const { data: existing } = await supabase
      .from('recipe_translations')
      .select('*')
      .eq('recipe_id', recipeId)
      .eq('language_code', targetLanguage)
      .single();

    if (existing) {
      return res.status(200).json({ ...existing, cached: true });
    }

    const settings = await getSettings(supabase);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

    const targetName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;

    const ingredientText = JSON.stringify(
      ingredients.map((i) => ({ amount: i.amount, name: i.name, details: i.details ?? '' })),
    );

    const template = settings.gemini_prompt_translate && settings.gemini_prompt_translate.trim()
      ? settings.gemini_prompt_translate
      : TRANSLATE_TEMPLATE;
    const prompt = buildTranslatePrompt(template, targetName, title, description, instructions, ingredientText);

    const client = getGeminiClient(apiKey);
    const result = await generateJson<TranslationResult>(
      client,
      settings.gemini_model,
      prompt,
      { supabase, endpoint: 'translate', recipeId },
    );

    // Save to DB so this language is never re-translated
    const row = {
      recipe_id: recipeId,
      language_code: targetLanguage,
      title: result.title,
      description: result.description ?? '',
      instructions: result.instructions,
      ingredients: result.ingredients.map((i) => ({ ...i, details: i.details ?? '' })),
    };

    await supabase.from('recipe_translations').upsert(row, { onConflict: 'recipe_id,language_code' });

    // Also save detected source language back to the recipe (fire-and-forget)
    if (result.detectedSourceLanguage) {
      supabase
        .from('recipes')
        .update({ original_language: result.detectedSourceLanguage })
        .eq('id', recipeId)
        .then(() => {}, () => {});
    }

    return res.status(200).json({ ...row, detectedSourceLanguage: result.detectedSourceLanguage, cached: false });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    }
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to translate recipe';
    console.error('Translate error:', err);
    return res.status(500).json({ error: message });
  }
}
