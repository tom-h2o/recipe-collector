import type { Context } from 'hono';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { ZodError } from 'zod';
import { getServerSupabase, getSettings, resolveApiKey, getUserId } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { checkRateLimit, rateLimitResponse } from './_lib/rateLimit.js';
import { extractSchema, extractPhotoSchema, extractPdfSchema } from './_lib/schemas.js';
import { EXTRACT_TEMPLATE } from './_lib/prompts.js';

const CACHE_TTL_DAYS = 7;

function buildPhotoPrompt(temperatureUnit: 'C' | 'F'): string {
  return `You are a culinary assistant that extracts recipes from food photos or handwritten recipe cards.
Look at the image carefully and extract any recipe information visible.

Return ONLY a JSON object with this exact structure:
{
  "title": "Recipe Title",
  "description": "Short, enticing summary of the dish (1-2 sentences)",
  "original_language": "en",
  "servings": 4,
  "prep_time_mins": 15,
  "cook_time_mins": 30,
  "ingredients": [
    { "amount": "200g", "name": "pasta", "details": "" },
    { "amount": "2", "name": "eggs", "details": "beaten" },
    { "amount": "", "name": "salt", "details": "to taste" }
  ],
  "instructions": "Step 1: Do this.\\nStep 2: Do that.",
  "image_url": "",
  "source_name": ""
}

Rules:
- "original_language" MUST ALWAYS be a 2-letter ISO 639-1 language code detected from the recipe content. This field MUST be present in every response.
- If this is a photo of a finished dish (not a recipe card), infer a likely recipe.
- "ingredients" MUST be an array of objects with "amount", "name", and "details".
- Extract descriptors ("finely chopped", "softened") into "details". Keep "name" as the pure ingredient.
- "servings", "prep_time_mins", "cook_time_mins" must be integers or null if unknown.
- Express all temperatures in °${temperatureUnit} (${temperatureUnit === 'C' ? 'Celsius' : 'Fahrenheit'}). Convert any other unit found.
- "instructions" should use newlines to separate steps. Remove any existing step numbering.
- "image_url" and "source_name" should always be empty string.`;
}

function buildPdfPrompt(temperatureUnit: 'C' | 'F'): string {
  return `You are a culinary assistant that extracts recipes from PDF documents.
Read the document carefully and extract any recipe information present.

Return ONLY a JSON object with this exact structure:
{
  "title": "Recipe Title",
  "description": "Short, enticing summary of the dish (1-2 sentences)",
  "original_language": "en",
  "servings": 4,
  "prep_time_mins": 15,
  "cook_time_mins": 30,
  "ingredients": [
    { "amount": "200g", "name": "pasta", "details": "" },
    { "amount": "2", "name": "eggs", "details": "beaten" },
    { "amount": "", "name": "salt", "details": "to taste" }
  ],
  "instructions": "Step 1: Do this.\\nStep 2: Do that.",
  "image_url": "",
  "source_name": ""
}

Rules:
- "original_language" MUST ALWAYS be a 2-letter ISO 639-1 language code detected from the recipe content. This field MUST be present in every response.
- If the PDF contains multiple recipes, extract the first or most prominent one.
- "ingredients" MUST be an array of objects with "amount", "name", and "details".
- Extract descriptors ("finely chopped", "softened") into "details". Keep "name" as the pure ingredient.
- "servings", "prep_time_mins", "cook_time_mins" must be integers or null if unknown.
- Express all temperatures in °${temperatureUnit} (${temperatureUnit === 'C' ? 'Celsius' : 'Fahrenheit'}). Convert any other unit found.
- "instructions" should use newlines to separate steps. Remove any existing step numbering.
- "image_url" and "source_name" should always be empty string.`;
}

export default async function handler(c: Context) {
  const supabase = getServerSupabase();
  const userId = await getUserId(c.req.header('authorization'));
  if (userId) { const rl = await checkRateLimit(supabase, userId); if (!rl.allowed) return rateLimitResponse(c, rl); }
  const settings = await getSettings(supabase, userId);
  const apiKey = resolveApiKey(settings);
  if (!apiKey) return c.json({ error: 'GEMINI_API_KEY is not configured.' }, 500);

  try {
    const body = await c.req.json().catch(() => ({}));

    // ── Photo extraction ───────────────────────────────────────────────────────
    if (body?.imageBase64 !== undefined) {
      const { imageBase64, mimeType } = extractPhotoSchema.parse(body);
      const client = getGeminiClient(apiKey);
      const startTime = Date.now();
      try {
        const response = await client.models.generateContent({
          model: settings.gemini_model,
          contents: [{ role: 'user', parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: buildPhotoPrompt(settings.temperature_unit) },
          ]}],
          config: { responseMimeType: 'application/json', temperature: 0.1 },
        });
        const text = response.text;
        if (!text) throw new Error('Gemini returned an empty response.');
        const recipeData = JSON.parse(text);
        supabase.from('gemini_logs').insert({ endpoint: 'extract-photo', model: settings.gemini_model, status: 'success', latency_ms: Date.now() - startTime, input_preview: `[image ${mimeType}]`, output_preview: text.substring(0, 300), user_id: userId ?? null }).then(() => {}, () => {});
        return c.json(recipeData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        supabase.from('gemini_logs').insert({ endpoint: 'extract-photo', model: settings.gemini_model, status: 'error', latency_ms: Date.now() - startTime, input_preview: `[image ${mimeType}]`, error_message: errorMessage, user_id: userId ?? null }).then(() => {}, () => {});
        throw err;
      }
    }

    // ── PDF extraction ─────────────────────────────────────────────────────────
    if (body?.pdfBase64 !== undefined) {
      const { pdfBase64 } = extractPdfSchema.parse(body);
      const client = getGeminiClient(apiKey);
      const startTime = Date.now();
      try {
        const response = await client.models.generateContent({
          model: settings.gemini_model,
          contents: [{ role: 'user', parts: [
            { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
            { text: buildPdfPrompt(settings.temperature_unit) },
          ]}],
          config: { responseMimeType: 'application/json', temperature: 0.1 },
        });
        const text = response.text;
        if (!text) throw new Error('Gemini returned an empty response.');
        const recipeData = JSON.parse(text);
        supabase.from('gemini_logs').insert({ endpoint: 'extract-pdf', model: settings.gemini_model, status: 'success', latency_ms: Date.now() - startTime, input_preview: '[PDF document]', output_preview: text.substring(0, 300), user_id: userId ?? null }).then(() => {}, () => {});
        return c.json(recipeData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        supabase.from('gemini_logs').insert({ endpoint: 'extract-pdf', model: settings.gemini_model, status: 'error', latency_ms: Date.now() - startTime, input_preview: '[PDF document]', error_message: errorMessage, user_id: userId ?? null }).then(() => {}, () => {});
        throw err;
      }
    }

    // ── URL extraction ─────────────────────────────────────────────────────────
    const { url } = extractSchema.parse(body);
    const tempNote = `\n- Express all temperatures in °${settings.temperature_unit} (${settings.temperature_unit === 'C' ? 'Celsius' : 'Fahrenheit'}). Convert any other unit found.`;
    const promptTemplate = (settings.gemini_prompt?.trim() ? settings.gemini_prompt : EXTRACT_TEMPLATE) + tempNote;

    const urlHash = createHash('sha256').update(url).digest('hex');
    const { data: cached } = await supabase.from('url_cache').select('extracted_data, created_at').eq('url_hash', urlHash).single();
    if (cached) {
      const ageMs = Date.now() - new Date(cached.created_at).getTime();
      if (ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return c.json(cached.extracted_data);
    }

    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeCollector/1.0)' } });
    if (!response.ok) throw new Error(`Failed to fetch URL: ${response.statusText}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
    const pageDescription = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    $('script, style, nav, footer, iframe, svg').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').substring(0, 20000);

    const combinedContent = `Title: ${pageTitle}\nDescription: ${pageDescription}\nOG Image: ${ogImage}\n\nBody Text:\n${bodyText}`;
    const finalPrompt = `${promptTemplate}\n\nWebpage Text to Extract From:\n${combinedContent}`;
    const client = getGeminiClient(apiKey);
    const recipeData = await generateJson(client, settings.gemini_model, finalPrompt, { supabase, endpoint: 'extract', userId });

    supabase.from('url_cache').upsert({ url_hash: urlHash, extracted_data: recipeData }).then(() => {}, () => {});
    return c.json(recipeData);

  } catch (err: unknown) {
    if (err instanceof ZodError) return c.json({ error: err.errors[0]?.message ?? 'Invalid request' }, 400);
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to extract recipe';
    return c.json({ error: message }, 500);
  }
}
