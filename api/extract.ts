import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { extractSchema } from './_lib/schemas.js';

const CACHE_TTL_DAYS = 7;

const DEFAULT_PROMPT = `You are a culinary assistant that extracts recipes from raw extracted webpage text.
Your task is to find the recipe within the text below and return it strictly formatted as a JSON object.

The JSON MUST match this EXACT structure, nothing else:
{
  "title": "Recipe Title",
  "description": "Short, enticing summary of the dish (1-2 sentences)",
  "servings": 4,
  "ingredients": [
    { "amount": "200g", "name": "pasta" },
    { "amount": "2 tbsp", "name": "olive oil" },
    { "amount": "", "name": "salt and pepper" }
  ],
  "instructions": "Step 1: Do this.\\nStep 2: Do that.",
  "image_url": "a high quality public image URL from the content (prefer og:image), or empty string"
}

CRITICAL RULES:
- "ingredients" MUST be an array of objects with "amount" and "name" keys. Never a plain string array.
- If an ingredient has no measurable amount (e.g. 'salt and pepper to taste'), set "amount" to an empty string.
- "servings" must be an integer number (e.g. 4), or null if not found.
- "instructions" should use newlines (\\n) to separate steps. Remove any existing step numbering from the source text.
- If the text comes from an Instagram post, the recipe might be in the Description field. Extract it accurately!`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url } = extractSchema.parse(req.body);

    const supabase = getServerSupabase();
    const settings = await getSettings(supabase);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

    const promptTemplate = settings.gemini_prompt?.trim() ? settings.gemini_prompt : DEFAULT_PROMPT;

    // Check URL cache first
    const urlHash = createHash('sha256').update(url).digest('hex');
    const { data: cached } = await supabase
      .from('url_cache')
      .select('extracted_data, created_at')
      .eq('url_hash', urlHash)
      .single();
    if (cached) {
      const ageMs = Date.now() - new Date(cached.created_at).getTime();
      if (ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) {
        console.log(`Cache hit for URL: ${url}`);
        return res.status(200).json(cached.extracted_data);
      }
    }

    console.log(`Fetching URL: ${url} | Model: ${settings.gemini_model}`);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeCollector/1.0)' },
    });
    if (!response.ok) throw new Error(`Failed to fetch URL: ${response.statusText}`);

    const html = await response.text();
    const $ = cheerio.load(html);

    const pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
    const pageDescription =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';

    $('script, style, nav, footer, iframe, svg').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').substring(0, 20000);

    const combinedContent = `Title: ${pageTitle}\nDescription: ${pageDescription}\nOG Image: ${ogImage}\n\nBody Text:\n${bodyText}`;
    const finalPrompt = `${promptTemplate}\n\nWebpage Text to Extract From:\n${combinedContent}`;

    const client = getGeminiClient(apiKey);
    const recipeData = await generateJson(client, settings.gemini_model, finalPrompt);

    // Store in cache (fire-and-forget)
    supabase.from('url_cache').upsert({ url_hash: urlHash, extracted_data: recipeData }).catch(() => {});

    return res.status(200).json(recipeData);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    }
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to extract recipe from URL';
    console.error('Extraction error:', err);
    return res.status(500).json({ error: message });
  }
}
