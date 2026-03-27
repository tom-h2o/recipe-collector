import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

  try {
    const { recipeId, title, ingredients, servings } = req.body;
    if (!recipeId || !ingredients) return res.status(400).json({ error: 'recipeId and ingredients required.' });

    const ingredientText = Array.isArray(ingredients)
      ? ingredients.map((i: any) => `${i.amount || ''} ${i.name || i}`.trim()).join('\n')
      : ingredients;

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a nutritional analysis assistant.
Estimate the nutritional content for ONE serving of the following recipe.
Base your estimate on the ingredients listed. If servings is provided, divide total nutrients accordingly.

Recipe: ${title}
Servings: ${servings || 'unknown'}
Ingredients:
${ingredientText}

Return ONLY a JSON object with these exact keys (all values are numbers, per serving):
{
  "calories": 450,
  "protein_g": 28,
  "carbs_g": 40,
  "fat_g": 18,
  "fiber_g": 6
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.1 }
    });

    const nutrition = JSON.parse(response.text || '{}');

    // Save back to Supabase
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || '',
      process.env.VITE_SUPABASE_ANON_KEY || ''
    );
    await supabase.from('recipes').update({ nutrition }).eq('id', recipeId);

    return res.status(200).json({ nutrition });
  } catch (error: any) {
    console.error('Nutrition error:', error);
    return res.status(500).json({ error: error.message || 'Failed to estimate nutrition' });
  }
}
