import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey, getUserId, modelFor } from './_lib/supabase.js';
import { extractedRecipeResponseSchema } from './_lib/responseSchemas.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { extractedRecipeSchema, extractSchema, extractPhotoSchema, extractPdfSchema, normaliseExtractPhotoBody } from './_lib/schemas.js';
import { EXTRACT_TEMPLATE } from './_lib/prompts.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { getCached, makeCacheKey, setCached } from './_lib/cache.js';
import { fetchPublicUrl } from './_lib/publicUrl.js';

export interface ExtractedIngredient {
  amount: string;
  name: string;
  details: string;
}

export interface ExtractedRecipe {
  title: string;
  description: string;
  original_language: string;
  servings: number | null;
  prep_time_mins: number | null;
  cook_time_mins: number | null;
  ingredients: ExtractedIngredient[];
  instructions: string;
  image_url: string;
  source_name: string;
}

type JsonRecord = Record<string, unknown>;

const INGREDIENT_AMOUNT_RE =
  /^((?:\d+\s*[-–]?\s*)?(?:\d+\/\d+|[\d.,]+|[½¼¾⅓⅔⅛⅜⅝⅞])?\s*(?:Pck\.?|Packung(?:en)?|TL|EL|g|kg|ml|l|Liter|Tasse(?:n)?|Prise(?:n)?|Stück|Scheibe(?:n)?|Becher|Dose(?:n)?|Bund)?(?:\s|$))/i;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null ? value as JsonRecord : null;
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  const record = asRecord(value);
  if (record) return stringValue(record.name ?? record.text ?? record.url);
  return '';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return stringValue(value) ? [stringValue(value)] : [];
  return value.map(stringValue).filter(Boolean);
}

function includesRecipeType(value: unknown): boolean {
  if (typeof value === 'string') return value.toLowerCase() === 'recipe';
  return Array.isArray(value) && value.some(includesRecipeType);
}

function findRecipeNode(value: unknown): JsonRecord | null {
  const record = asRecord(value);
  if (record) {
    if (includesRecipeType(record['@type'])) return record;
    for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
      const found = findRecipeNode(record[key]);
      if (found) return found;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
  }
  return null;
}

function parseIsoDuration(value: unknown): number | null {
  const text = stringValue(value);
  if (!text) return null;
  const match = text.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60);
}

function parseServings(value: unknown): number | null {
  const text = stringArray(value).join(' ');
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parseIngredient(value: string): ExtractedIngredient {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  const [main, ...detailParts] = cleaned.split(/\s+-\s+|,\s+/);
  const match = main.match(INGREDIENT_AMOUNT_RE);
  const rawAmount = match?.[0].trim() ?? '';
  const name = (rawAmount ? main.slice(rawAmount.length) : main).trim();
  return {
    amount: rawAmount,
    name,
    details: detailParts.join(', ').trim(),
  };
}

function instructionText(value: unknown): string[] {
  if (typeof value === 'string') return [value.trim()].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(instructionText);
  const record = asRecord(value);
  if (!record) return [];
  const nested = instructionText(record.itemListElement);
  const text = stringValue(record.text ?? record.name);
  return [...(text ? [text] : []), ...nested];
}

function imageUrl(value: unknown): string {
  const direct = stringValue(value);
  if (direct) return direct;
  if (Array.isArray(value)) return value.map(imageUrl).find(Boolean) ?? '';
  const record = asRecord(value);
  return record ? stringValue(record.url ?? record.contentUrl) : '';
}

export function extractStructuredRecipe($: CheerioAPI, pageDescription: string, ogImage: string): ExtractedRecipe | null {
  const htmlLanguage = ($('html').attr('lang') ?? '').slice(0, 2).toLowerCase() || 'en';
  const scripts = $('script[type="application/ld+json"]').toArray();

  for (const script of scripts) {
    const raw = $(script).contents().text();
    if (!raw.trim()) continue;

    try {
      const recipe = findRecipeNode(JSON.parse(raw));
      if (!recipe) continue;

      const title = stringValue(recipe.name);
      const ingredients = stringArray(recipe.recipeIngredient).map(parseIngredient).filter((i) => i.name);
      const instructions = instructionText(recipe.recipeInstructions).join('\n');
      if (!title || ingredients.length === 0 || !instructions) continue;

      return {
        title,
        description: stringValue(recipe.description) || pageDescription,
        original_language: htmlLanguage,
        servings: parseServings(recipe.recipeYield ?? recipe.yield),
        prep_time_mins: parseIsoDuration(recipe.prepTime),
        cook_time_mins: parseIsoDuration(recipe.cookTime),
        ingredients,
        instructions,
        image_url: imageUrl(recipe.image) || ogImage,
        source_name: stringValue(recipe.author) || stringValue(recipe.publisher),
      };
    } catch {
      // Ignore malformed structured data and continue with AI extraction.
    }
  }

  return null;
}

function buildUrlExtractionPrompt(
  promptTemplate: string,
  pageTitle: string,
  pageDescription: string,
  ogImage: string,
  bodyText: string,
  structuredRecipe: ExtractedRecipe | null,
): string {
  const structuredBlock = structuredRecipe
    ? `\n\nMachine-readable Recipe data found on the page.
Use this as the primary source, but verify it against the visible webpage text before returning the final recipe.
If the structured data and visible text conflict, prefer the visible recipe card/instructions.

Structured Recipe JSON:
${JSON.stringify(structuredRecipe, null, 2)}`
    : '';

  return `${promptTemplate}

Return the final result in the app recipe JSON format. Verify the extracted recipe content before responding.
${structuredBlock}

Webpage Text to Verify Against:
Title: ${pageTitle}
Description: ${pageDescription}
OG Image: ${ogImage}

Body Text:
${bodyText}`;
}

function validateExtractedRecipe(value: unknown): ExtractedRecipe {
  return extractedRecipeSchema.parse(value);
}

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
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const settings = await getSettings(supabase, userId);
  const apiKey = resolveApiKey(settings);
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

  const body = req.body ?? {};

  try {
    // ── Photo extraction ───────────────────────────────────────────────────────
    if (body.imageBase64 !== undefined || body.images !== undefined) {
      const rl = await checkRateLimit(supabase, userId);
      if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });
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
        const response = await client.models.generateContent({ model: modelFor(settings, 'extract'), contents: [{ role: 'user', parts }], config: { responseMimeType: 'application/json', temperature: 0.1, responseSchema: extractedRecipeResponseSchema } });
        const text = response.text;
        if (!text) throw new Error('Gemini returned an empty response.');
        const recipeData = validateExtractedRecipe(JSON.parse(text));
        supabase.from('gemini_logs').insert({ endpoint: 'extract-photo', model: modelFor(settings, 'extract'), model_version: response.modelVersion ?? null, status: 'success', latency_ms: Date.now() - startTime, input_preview: inputPreview, output_preview: text.substring(0, 300), user_id: userId }).then(() => {}, () => {});
        return res.status(200).json(recipeData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        supabase.from('gemini_logs').insert({ endpoint: 'extract-photo', model: modelFor(settings, 'extract'), status: 'error', latency_ms: Date.now() - startTime, input_preview: inputPreview, error_message: errorMessage, user_id: userId }).then(() => {}, () => {});
        throw err;
      }
    }

    // ── PDF extraction ─────────────────────────────────────────────────────────
    if (body.pdfBase64 !== undefined) {
      const rl = await checkRateLimit(supabase, userId);
      if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });
      const { pdfBase64 } = extractPdfSchema.parse(body);
      const client = getGeminiClient(apiKey);
      const startTime = Date.now();
      try {
        const response = await client.models.generateContent({ model: modelFor(settings, 'extract'), contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }, { text: pdfPrompt(settings.temperature_unit) }] }], config: { responseMimeType: 'application/json', temperature: 0.1, responseSchema: extractedRecipeResponseSchema } });
        const text = response.text;
        if (!text) throw new Error('Gemini returned an empty response.');
        const recipeData = validateExtractedRecipe(JSON.parse(text));
        supabase.from('gemini_logs').insert({ endpoint: 'extract-pdf', model: modelFor(settings, 'extract'), model_version: response.modelVersion ?? null, status: 'success', latency_ms: Date.now() - startTime, input_preview: '[PDF document]', output_preview: text.substring(0, 300), user_id: userId }).then(() => {}, () => {});
        return res.status(200).json(recipeData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        supabase.from('gemini_logs').insert({ endpoint: 'extract-pdf', model: modelFor(settings, 'extract'), status: 'error', latency_ms: Date.now() - startTime, input_preview: '[PDF document]', error_message: errorMessage, user_id: userId }).then(() => {}, () => {});
        throw err;
      }
    }

    // ── URL extraction ─────────────────────────────────────────────────────────
    const { url } = extractSchema.parse(body);
    const tempNote = `\n- Express all temperatures in °${settings.temperature_unit} (${settings.temperature_unit === 'C' ? 'Celsius' : 'Fahrenheit'}). Convert any other unit found.`;
    const promptTemplate = EXTRACT_TEMPLATE + tempNote;

    const fetchRes = await fetchPublicUrl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeCollector/1.0)' } });
    if (!fetchRes.ok) throw new Error(`Failed to fetch URL: ${fetchRes.statusText}`);
    const html = await fetchRes.text();
    const $ = cheerio.load(html);
    const pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
    const pageDescription = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const structuredRecipe = extractStructuredRecipe($, pageDescription, ogImage);

    $('script, style, nav, footer, iframe, svg').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').substring(0, 20000);

    const finalPrompt = buildUrlExtractionPrompt(promptTemplate, pageTitle, pageDescription, ogImage, bodyText, structuredRecipe);
    const cacheKey = makeCacheKey('extract', { model: modelFor(settings, 'extract'), prompt: finalPrompt });
    const cachedRecipe = await getCached(supabase, cacheKey);
    if (cachedRecipe) {
      console.info('extract cache hit', { url, structuredDataFound: !!structuredRecipe });
      return res.status(200).json({ ...validateExtractedRecipe(cachedRecipe), cached: true, structured_data_found: !!structuredRecipe });
    }

    const rl = await checkRateLimit(supabase, userId);
    if (!rl.allowed) return res.status(429).json({ error: `Daily AI call limit reached (${rl.limit} calls/day). Resets at midnight UTC.` });

    const client = getGeminiClient(apiKey);
    const recipeData = validateExtractedRecipe(await generateJson(client, modelFor(settings, 'extract'), finalPrompt, { supabase, endpoint: 'extract', userId }, { responseSchema: extractedRecipeResponseSchema }));

    setCached(supabase, cacheKey, 'extract', recipeData, 24 * 7);
    console.info('extract gemini verified', { url, structuredDataFound: !!structuredRecipe });
    return res.status(200).json({ ...recipeData, cached: false, structured_data_found: !!structuredRecipe });

  } catch (err: unknown) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
    captureException(err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to extract recipe' });
  }
}
