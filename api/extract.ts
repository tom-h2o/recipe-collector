import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey, getUserId } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { extractSchema, extractPhotoSchema, extractPdfSchema, normaliseExtractPhotoBody } from './_lib/schemas.js';
import { EXTRACT_TEMPLATE } from './_lib/prompts.js';
import { checkRateLimit } from './_lib/rateLimit.js';

const CACHE_TTL_DAYS = 7;

/**
 * Without this, Gemini reports the source language correctly in
 * "original_language" but still writes the recipe itself in English.
 * The JSON skeletons below use English sample values, which biases it further,
 * so the rule has to be stated explicitly and repeated in the rule list.
 */
const LANGUAGE_DIRECTIVE = `CRITICAL — LANGUAGE:
First detect the language of the text in the source. Then write the ENTIRE response IN THAT LANGUAGE.
"title", "description", "instructions", and every ingredient "name" and "details" MUST be written in the detected source language — do NOT translate them into English.
For example, if the source is in Polish, "title", "description", "instructions" and all ingredient names must be Polish. If it is in German, they must be German.
The English words in the JSON example below illustrate the STRUCTURE ONLY — never copy their language.`;

const LANGUAGE_RULE = `- Write "title", "description", "instructions", and all ingredient "name"/"details" values in the detected source language, matching "original_language". Never translate the recipe into English unless the source itself is English.`;

function photoPrompt(unit: 'C' | 'F', imageCount: number) {
  const multi = imageCount > 1;
  const intro = multi
    ? `You are a culinary assistant that extracts recipes from food photos or handwritten recipe cards.
You are given ${imageCount} images that are pages or photos of ONE SINGLE recipe, provided in reading order.
Read all ${imageCount} images together and combine them into one complete recipe.`
    : `You are a culinary assistant that extracts recipes from food photos or handwritten recipe cards.
Look at the image carefully and extract any recipe information visible.`;

  return `${intro}

${LANGUAGE_DIRECTIVE}

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
- "original_language" MUST ALWAYS be a 2-letter ISO 639-1 language code detected from the text visible in the image${multi ? 's' : ''}.
${LANGUAGE_RULE}
- If this is a photo of a finished dish with no readable text, infer a likely recipe and write it in the language of any text visible in the image; if there is none, use English and set "original_language" to "en".${multi ? `
- Treat the ${imageCount} images as ONE recipe, not ${imageCount} separate recipes. Return a single recipe object.
- Merge content across images in the order given: ingredients from every image belong to the same list, and instructions continue from one image to the next.
- If a list or a step is cut off at the edge of one image and continues on the next, join it into a single entry rather than repeating it.
- Do not output the same ingredient or step twice when it appears on more than one image (e.g. a repeated header or an overlapping photo).` : ''}
- "ingredients" MUST be an array of objects with "amount", "name", and "details".
- "servings", "prep_time_mins", "cook_time_mins" must be integers or null if unknown.
- Express all temperatures in °${unit} (${unit === 'C' ? 'Celsius' : 'Fahrenheit'}). Convert any other unit found.
- "instructions" should use newlines to separate steps. Remove any existing step numbering.
- "image_url" and "source_name" should always be empty string.`;
}

function pdfPrompt(unit: 'C' | 'F') {
  return `You are a culinary assistant that extracts recipes from PDF documents.
Read the document carefully and extract any recipe information present.

${LANGUAGE_DIRECTIVE}

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
- "original_language" MUST ALWAYS be a 2-letter ISO 639-1 language code detected from the recipe content.
${LANGUAGE_RULE}
- If the PDF contains multiple recipes, extract the first or most prominent one.
- "ingredients" MUST be an array of objects with "amount", "name", and "details".
- "servings", "prep_time_mins", "cook_time_mins" must be integers or null if unknown.
- Express all temperatures in °${unit} (${unit === 'C' ? 'Celsius' : 'Fahrenheit'}). Convert any other unit found.
- "instructions" should use newlines to separate steps. Remove any existing step numbering.
- "image_url" and "source_name" should always be empty string.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getServerSupabase();
  const userId = await getUserId(req.headers.authorization as string | undefined);
  const settings = await getSettings(supabase, userId);
  const apiKey = resolveApiKey(settings);
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

  const body = req.body ?? {};

  try {
    // ── Photo extraction ───────────────────────────────────────────────────────
    if (body.imageBase64 !== undefined || body.images !== undefined) {
      if (userId) {
        const rl = await checkRateLimit(supabase, userId);
        if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });
      }
      const { images } = extractPhotoSchema.parse(normaliseExtractPhotoBody(body));
      const client = getGeminiClient(apiKey);
      const startTime = Date.now();
      // All pages go into a single request so Gemini sees the whole recipe at once.
      const parts = [
        ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
        { text: photoPrompt(settings.temperature_unit, images.length) },
      ];
      const inputPreview = `[${images.length} image${images.length === 1 ? '' : 's'}: ${images.map((i) => i.mimeType).join(', ')}]`;
      try {
        const response = await client.models.generateContent({ model: settings.gemini_model, contents: [{ role: 'user', parts }], config: { responseMimeType: 'application/json', temperature: 0.1 } });
        const text = response.text;
        if (!text) throw new Error('Gemini returned an empty response.');
        const recipeData = JSON.parse(text);
        supabase.from('gemini_logs').insert({ endpoint: 'extract-photo', model: settings.gemini_model, status: 'success', latency_ms: Date.now() - startTime, input_preview: inputPreview, output_preview: text.substring(0, 300), user_id: userId ?? null }).then(() => {}, () => {});
        return res.status(200).json(recipeData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        supabase.from('gemini_logs').insert({ endpoint: 'extract-photo', model: settings.gemini_model, status: 'error', latency_ms: Date.now() - startTime, input_preview: inputPreview, error_message: errorMessage, user_id: userId ?? null }).then(() => {}, () => {});
        throw err;
      }
    }

    // ── PDF extraction ─────────────────────────────────────────────────────────
    if (body.pdfBase64 !== undefined) {
      if (userId) {
        const rl = await checkRateLimit(supabase, userId);
        if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });
      }
      const { pdfBase64 } = extractPdfSchema.parse(body);
      const client = getGeminiClient(apiKey);
      const startTime = Date.now();
      try {
        const response = await client.models.generateContent({ model: settings.gemini_model, contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }, { text: pdfPrompt(settings.temperature_unit) }] }], config: { responseMimeType: 'application/json', temperature: 0.1 } });
        const text = response.text;
        if (!text) throw new Error('Gemini returned an empty response.');
        const recipeData = JSON.parse(text);
        supabase.from('gemini_logs').insert({ endpoint: 'extract-pdf', model: settings.gemini_model, status: 'success', latency_ms: Date.now() - startTime, input_preview: '[PDF document]', output_preview: text.substring(0, 300), user_id: userId ?? null }).then(() => {}, () => {});
        return res.status(200).json(recipeData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        supabase.from('gemini_logs').insert({ endpoint: 'extract-pdf', model: settings.gemini_model, status: 'error', latency_ms: Date.now() - startTime, input_preview: '[PDF document]', error_message: errorMessage, user_id: userId ?? null }).then(() => {}, () => {});
        throw err;
      }
    }

    // ── URL extraction ─────────────────────────────────────────────────────────
    const { url } = extractSchema.parse(body);
    const tempNote = `\n- Express all temperatures in °${settings.temperature_unit} (${settings.temperature_unit === 'C' ? 'Celsius' : 'Fahrenheit'}). Convert any other unit found.`;
    const promptTemplate = EXTRACT_TEMPLATE + tempNote;

    const urlHash = createHash('sha256').update(url).digest('hex');
    const { data: cached } = await supabase.from('url_cache').select('extracted_data, created_at').eq('url_hash', urlHash).single();
    if (cached) {
      const ageMs = Date.now() - new Date(cached.created_at).getTime();
      if (ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return res.status(200).json(cached.extracted_data);
    }

    if (userId) {
      const rl = await checkRateLimit(supabase, userId);
      if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });
    }

    const fetchRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeCollector/1.0)' } });
    if (!fetchRes.ok) throw new Error(`Failed to fetch URL: ${fetchRes.statusText}`);
    const html = await fetchRes.text();
    const $ = cheerio.load(html);
    const pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
    const pageDescription = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    $('script, style, nav, footer, iframe, svg').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').substring(0, 20000);

    const finalPrompt = `${promptTemplate}\n\nWebpage Text to Extract From:\nTitle: ${pageTitle}\nDescription: ${pageDescription}\nOG Image: ${ogImage}\n\nBody Text:\n${bodyText}`;
    const client = getGeminiClient(apiKey);
    const recipeData = await generateJson(client, settings.gemini_model, finalPrompt, { supabase, endpoint: 'extract', userId });

    supabase.from('url_cache').upsert({ url_hash: urlHash, extracted_data: recipeData }).then(() => {}, () => {});
    return res.status(200).json(recipeData);

  } catch (err: unknown) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    captureException(err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to extract recipe' });
  }
}
