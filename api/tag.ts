import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const AVAILABLE_TAGS = [
  "Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free",
  "High Protein", "Low Carb", "Quick (<30min)", "Comfort Food",
  "Italian", "Asian", "Mexican", "Mediterranean", "Indian", "American",
  "Breakfast", "Lunch", "Dinner", "Dessert", "Snack", "Soup",
  "Baking", "Grilling", "One-Pot"
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let apiKey = process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY;
  const supabaseApiKeyClient = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  );
  try {
    const { data } = await supabaseApiKeyClient.from('settings').select('active_api_key').eq('id', 1).single();
    if (data && data.active_api_key === 2) {
      apiKey = process.env.GEMINI_API_KEY_2 || apiKey;
    }
  } catch(e) {}
  
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

  try {
    const { recipeId, title, description, ingredients, instructions } = req.body;
    if (!recipeId || !title) return res.status(400).json({ error: 'recipeId and title are required' });

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a recipe categorisation assistant.
Given the following recipe, select ONLY the most relevant tags from this list:
${AVAILABLE_TAGS.join(', ')}

Rules:
- Select 2–5 tags maximum.
- Only use tags from the provided list.
- Return a JSON array of strings, nothing else. Example: ["Italian", "Quick (<30min)", "Vegetarian"]

Recipe:
Title: ${title}
Description: ${description || ''}
Ingredients: ${Array.isArray(ingredients) ? ingredients.map((i: any) => `${i.amount || ''} ${i.name || i}`.trim()).join(', ') : ingredients}
Instructions: ${(instructions || '').substring(0, 500)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.1 }
    });

    const tags: string[] = JSON.parse(response.text || '[]');
    const validTags = tags.filter(t => AVAILABLE_TAGS.includes(t));

    // Save tags back to the recipe in Supabase
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || '',
      process.env.VITE_SUPABASE_ANON_KEY || ''
    );
    await supabase.from('recipes').update({ tags: validTags }).eq('id', recipeId);

    return res.status(200).json({ tags: validTags });
  } catch (error: any) {
    console.error('Tagging error:', error);
    return res.status(500).json({ error: error.message || 'Failed to tag recipe' });
  }
}
