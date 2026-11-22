import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoogleGenAI } from '@google/genai';
import { modelFor, thinkingFor, type Settings } from './supabase.js';
import { extractedRecipeResponseSchema } from './responseSchemas.js';
import { generateJson } from './gemini.js';
import { extractedRecipeSchema } from './schemas.js';
import { EXTRACT_TEMPLATE } from './prompts.js';
import { checkRateLimit } from './rateLimit.js';
import { getCached, makeCacheKey, setCached } from './cache.js';
import { DailyLimitError } from './enrich.js';

/**
 * A recipe from a web page's HTML: its schema.org Recipe data where it has
 * some, checked by the model against the page's visible text.
 *
 * Two ways in share this. A link pasted into the app (the server fetches the
 * page), and the Safari Shortcut, which sends the page the person has open:
 * sites such as rewe.de refuse pages to servers (see describePageRefusal in
 * api/extract.ts), but not to the person reading them.
 */

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

export function buildUrlExtractionPrompt(
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

export function validateExtractedRecipe(value: unknown): ExtractedRecipe {
  return extractedRecipeSchema.parse(value);
}

export interface PageExtractionContext {
  supabase: SupabaseClient;
  client: GoogleGenAI;
  settings: Settings;
  userId: string;
  /** The gemini_logs endpoint: 'extract' for a link, 'extract-page' for the Safari Shortcut. */
  endpoint: string;
}

export interface PageExtraction {
  recipe: ExtractedRecipe;
  cached: boolean;
  structuredDataFound: boolean;
}

/** Most of a page's text is navigation and advertising; the recipe is near the top. */
const MAX_BODY_TEXT = 20000;

/**
 * Reads the recipe from a page's HTML. A page read before (same prompt, same
 * model) is answered from ai_cache and costs none of the allowance; otherwise
 * the daily allowance is checked first and DailyLimitError thrown when used up.
 * An answer without a title, ingredients or method throws a ZodError.
 */
export async function extractRecipeFromHtml(ctx: PageExtractionContext, html: string): Promise<PageExtraction> {
  const { supabase, client, settings, userId, endpoint } = ctx;
  const unit = settings.temperature_unit;
  const promptTemplate = `${EXTRACT_TEMPLATE}\n- Express all temperatures in °${unit} (${unit === 'C' ? 'Celsius' : 'Fahrenheit'}). Convert any other unit found.`;

  const $ = cheerio.load(html);
  const pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
  const pageDescription = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const structuredRecipe = extractStructuredRecipe($, pageDescription, ogImage);

  $('script, style, nav, footer, iframe, svg').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').substring(0, MAX_BODY_TEXT);

  const finalPrompt = buildUrlExtractionPrompt(promptTemplate, pageTitle, pageDescription, ogImage, bodyText, structuredRecipe);
  const cacheKey = makeCacheKey('extract', { model: modelFor(settings, 'extract'), prompt: finalPrompt });
  const cachedRecipe = await getCached(supabase, cacheKey);
  if (cachedRecipe) return { recipe: validateExtractedRecipe(cachedRecipe), cached: true, structuredDataFound: !!structuredRecipe };

  const rl = await checkRateLimit(supabase, userId);
  if (!rl.allowed) throw new DailyLimitError(rl.limit);

  const recipe = validateExtractedRecipe(await generateJson(client, modelFor(settings, 'extract'), finalPrompt, { supabase, endpoint, userId }, { responseSchema: extractedRecipeResponseSchema, thinking: thinkingFor('extract') }));
  setCached(supabase, cacheKey, 'extract', recipe, 24 * 7);
  return { recipe, cached: false, structuredDataFound: !!structuredRecipe };
}
