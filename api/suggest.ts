import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let apiKey = process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY;
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  );
  try {
    const { data } = await supabase.from('settings').select('active_api_key').eq('id', 1).single();
    if (data && data.active_api_key === 2) {
      apiKey = process.env.GEMINI_API_KEY_2 || apiKey;
    }
  } catch(e) {}
  
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

  try {
    const { ingredients: userIngredients } = req.body;
    if (!userIngredients || !Array.isArray(userIngredients) || userIngredients.length === 0) {
      return res.status(400).json({ error: 'ingredients array is required' });
    }

    // Fetch all recipes from Supabase
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || '',
      process.env.VITE_SUPABASE_ANON_KEY || ''
    );
    const { data: recipes } = await supabase.from('recipes').select('*');

    if (!recipes || recipes.length === 0) {
      return res.status(200).json({ suggestions: [] });
    }

    const recipeList = recipes.map((r: any) => {
      const ingList = Array.isArray(r.ingredients)
        ? r.ingredients.map((i: any) => typeof i === 'object' ? i.name : i).join(', ')
        : '';
      return `ID: ${r.id} | Title: ${r.title} | Ingredients: ${ingList}`;
    }).join('\n');

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a cooking assistant helping a user decide what to cook.

The user has these ingredients available: ${userIngredients.join(', ')}

Here are the recipes in their collection:
${recipeList}

Select the recipes that best match the available ingredients. Prefer recipes where the user has most of the required ingredients. Return up to 5 recipe IDs that are the best matches.

Return ONLY a JSON array of recipe ID strings, nothing else. Example: ["uuid-1", "uuid-2"]`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.1 }
    });

    const suggestedIds: string[] = JSON.parse(response.text || '[]');
    const matchedRecipes = recipes.filter((r: any) => suggestedIds.includes(r.id));

    return res.status(200).json({ suggestions: matchedRecipes });
  } catch (error: any) {
    console.error('Suggest error:', error);
    return res.status(500).json({ error: error.message || 'Failed to suggest recipes' });
  }
}
