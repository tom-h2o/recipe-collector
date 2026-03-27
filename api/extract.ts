import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_MODEL = 'gemini-2.5-flash';
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
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let apiKey = process.env.GEMINI_API_KEY;

  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Read settings from Supabase
    let model = DEFAULT_MODEL;
    let promptTemplate = DEFAULT_PROMPT;
    try {
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
      );
      const { data } = await supabase.from('settings').select('*').eq('id', 1).single();
      if (data) {
        if (data.gemini_model) model = data.gemini_model;
        if (data.gemini_prompt && data.gemini_prompt.trim()) promptTemplate = data.gemini_prompt;
        if (data.active_api_key === 1 && data.api_key_1) apiKey = data.api_key_1;
        if (data.active_api_key === 2 && data.api_key_2) apiKey = data.api_key_2;
      }
    } catch (e) {
      console.warn('Could not read settings from Supabase, using defaults.', e);
    }

    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

    console.log(`Fetching URL: ${url} | Model: ${model}`);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeCollector/1.0)' }
    });
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

    const ai = new GoogleGenAI({ apiKey });
    const responseAI = await ai.models.generateContent({
      model,
      contents: finalPrompt,
      config: { responseMimeType: 'application/json', temperature: 0.1 }
    });

    const resultText = responseAI.text;
    if (!resultText) throw new Error('Gemini returned an empty response.');

    const recipeData = JSON.parse(resultText);
    return res.status(200).json(recipeData);

  } catch (error: any) {
    console.error('Extraction error:', error);
    return res.status(500).json({ error: error.message || 'Failed to extract recipe from URL' });
  }
}
