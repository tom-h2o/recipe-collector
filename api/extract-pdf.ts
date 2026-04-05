import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { setCorsHeaders } from './_lib/cors.js';
import { getServerSupabase, getSettings, resolveApiKey } from './_lib/supabase.js';
import { getGeminiClient } from './_lib/gemini.js';
import { captureException } from './_lib/sentry.js';
import { extractPdfSchema } from './_lib/schemas.js';

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
- "original_language" MUST ALWAYS be a 2-letter ISO 639-1 language code detected from the recipe content (e.g. "en", "de", "fr", "es", "pl", "it"). Detect the language of the title, description, and instructions in the document. This field MUST be present in every response.
- If the PDF contains multiple recipes, extract the first or most prominent one.
- "ingredients" MUST be an array of objects with "amount", "name", and "details".
- Extract descriptors ("finely chopped", "softened") into "details". Keep "name" as the pure ingredient.
- "servings", "prep_time_mins", "cook_time_mins" must be integers or null if unknown.
- Express all temperatures in °${temperatureUnit} (${temperatureUnit === 'C' ? 'Celsius' : 'Fahrenheit'}). Convert any other unit found.
- "instructions" should use newlines to separate steps. Remove any existing step numbering.
- "image_url" should always be empty string.
- "source_name" should be empty string.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { pdfBase64 } = extractPdfSchema.parse(req.body);

    const supabase = getServerSupabase();
    const settings = await getSettings(supabase);
    const apiKey = resolveApiKey(settings);
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

    const client = getGeminiClient(apiKey);

    const startTime = Date.now();
    let status: 'success' | 'error' = 'success';
    let errorMessage: string | undefined;

    try {
      const response = await client.models.generateContent({
        model: settings.gemini_model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
              { text: buildPdfPrompt(settings.temperature_unit) },
            ],
          },
        ],
        config: { responseMimeType: 'application/json', temperature: 0.1 },
      });

      const text = response.text;
      if (!text) throw new Error('Gemini returned an empty response.');
      const recipeData = JSON.parse(text);

      supabase.from('gemini_logs').insert({
        endpoint: 'extract-pdf',
        model: settings.gemini_model,
        status: 'success',
        latency_ms: Date.now() - startTime,
        input_preview: '[PDF document]',
        output_preview: text.substring(0, 300),
      }).then(() => {}, () => {});

      return res.status(200).json(recipeData);
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : String(err);
      supabase.from('gemini_logs').insert({
        endpoint: 'extract-pdf',
        model: settings.gemini_model,
        status,
        latency_ms: Date.now() - startTime,
        input_preview: '[PDF document]',
        error_message: errorMessage,
      }).then(() => {}, () => {});
      throw err;
    }
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
    }
    captureException(err);
    const message = err instanceof Error ? err.message : 'Failed to extract recipe from PDF';
    console.error('PDF extraction error:', err);
    return res.status(500).json({ error: message });
  }
}
