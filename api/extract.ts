import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey } from './_lib/supabase.js';
import { getGeminiClient, generateJson } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { extractSchema } from './_lib/schemas.js';
import { EXTRACT_TEMPLATE } from './_lib/prompts.js';

const CACHE_TTL_DAYS = 7;

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

    const tempNote = `\n- Express all temperatures in °${settings.temperature_unit} (${settings.temperature_unit === 'C' ? 'Celsius' : 'Fahrenheit'}). Convert any other unit found.`;
    const promptTemplate = (settings.gemini_prompt?.trim() ? settings.gemini_prompt : EXTRACT_TEMPLATE) + tempNote;

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
    const recipeData = await generateJson(client, settings.gemini_model, finalPrompt, { supabase, endpoint: 'extract' });

    // Store in cache (fire-and-forget)
    supabase.from('url_cache').upsert({ url_hash: urlHash, extracted_data: recipeData }).then(() => {}, () => {});

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
