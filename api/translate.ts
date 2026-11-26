import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey, getUserId, userCanReadRecipe, modelFor, thinkingFor } from './_lib/supabase.js';
import { translationResponseSchema } from './_lib/responseSchemas.js';
import { getGeminiClient, generateJson, describeGeminiError } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { translationResultSchema, translateSchema } from './_lib/schemas.js';
import { TRANSLATE_TEMPLATE } from './_lib/prompts.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { assertPlausibleTranslation, splitSteps } from './_lib/translationGuard.js';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', de: 'German', fr: 'French', es: 'Spanish' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { recipeId, targetLanguage } = translateSchema.parse(req.body);
    const supabase = getServerSupabase();
    const userId = await getUserId(req.headers.authorization as string | undefined);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    // Read visibility, not ownership: a linked account can open the recipe and
    // the UI offers it the language picker, so an ownership check 403'd every
    // attempt to translate a recipe shared from a connected account.
    if (!await userCanReadRecipe(supabase, recipeId, userId)) return res.status(403).json({ error: 'Forbidden' });

    const { data: existing } = await supabase.from('recipe_translations').select('*').eq('recipe_id', recipeId).eq('language_code', targetLanguage).single();
    if (existing) return res.status(200).json({ ...existing, cached: true });

    // The recipe as stored, never as the request describes it. The text used to
    // come with the request, and the result is stored on the recipe for its
    // owner and everyone linked to them: a linked account could make a recipe
    // that was not theirs "say" anything in another language.
    const { data: source, error: sourceError } = await supabase
      .from('recipes')
      .select('title, description, instructions, ingredients')
      .eq('id', recipeId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return res.status(404).json({ error: 'Recipe not found.' });
    const title = String(source.title ?? '');
    const description = String(source.description ?? '');
    const instructions = String(source.instructions ?? '');
    const ingredients = (Array.isArray(source.ingredients) ? source.ingredients : [])
      .filter((i: unknown): i is Record<string, unknown> => !!i && typeof i === 'object')
      .map((i) => ({ amount: String(i.amount ?? ''), name: String(i.name ?? ''), details: String(i.details ?? '') }));
    if (!title.trim() || !instructions.trim() || ingredients.length === 0) {
      return res.status(400).json({ error: 'This recipe needs a title, ingredients and steps before it can be translated.' });
    }

    const rl = await checkRateLimit(supabase, userId);
    if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });

    const settings = await getSettings(supabase, userId);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

    const targetName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;
    const ingredientText = JSON.stringify(ingredients.map((i) => ({ amount: i.amount, name: i.name, details: i.details ?? '' })));
    // Steps go out as an array and come back as one. Sent as a single string
    // they were only line breaks inside it, and a translation came back with
    // steps 1 to 4 run together into one point.
    const steps = splitSteps(instructions);
    const prompt = `${TRANSLATE_TEMPLATE} Translate the following recipe into ${targetName}.

Input recipe:
{
  "title": ${JSON.stringify(title)},
  "description": ${JSON.stringify(description)},
  "instructions": ${JSON.stringify(steps)},
  "ingredients": ${ingredientText}
}

The recipe has ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}, so "instructions" in your answer must have exactly ${steps.length} ${steps.length === 1 ? 'entry' : 'entries'}.

Return this exact JSON structure:
{
  "detectedSourceLanguage": "en",
  "title": "...",
  "description": "...",
  "instructions": ["...", "..."],
  "ingredients": [{ "amount": "...", "name": "...", "details": "..." }]
}`;

    const client = getGeminiClient(apiKey);
    const result = translationResultSchema.parse(
      await generateJson(client, modelFor(settings, 'translate'), prompt, { supabase, endpoint: 'translate', recipeId, userId }, {
        responseSchema: translationResponseSchema,
        // Translating given text into a given shape leaves nothing to reason
        // about, and the thinking pass is what makes this the slowest endpoint
        // people wait on — gemini_logs has a successful translate at 124s.
        thinking: thinkingFor('translate'),
        // The schema fixes the shape, not the content: leaked reasoning in the
        // title is a valid string. Refused here it is asked for once more and
        // otherwise never reaches the upsert below — a stored translation is
        // served from the cache on every later open.
        validate: (raw) => {
          const candidate = translationResultSchema.safeParse(raw);
          // An answer of the wrong shape is the parse above's to report.
          if (candidate.success) assertPlausibleTranslation({ title, description, instructions, ingredients }, candidate.data);
        },
      }),
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
    // Never pass err.message through: for a Gemini failure that is the raw
    // API envelope, which reads as though the user's recipe is at fault.
    const described = describeGeminiError(err, 'Failed to translate recipe');
    return res.status(described.status).json({ error: described.message });
  }
}
