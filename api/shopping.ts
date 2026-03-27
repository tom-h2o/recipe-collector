import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

  try {
    const { ingredients } = req.body;
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: 'ingredients array is required' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are an AI grocery assistant.
Take the following list of raw ingredients from various recipes.
1. Aggregate any duplicate ingredients (e.g., "1 onion" and "2 onions" becomes "3 onions"). Convert units to be consistent if necessary.
2. Group the aggregated ingredients into logical supermarket aisles/categories (e.g., "Produce", "Dairy & Eggs", "Meat", "Pantry", etc.).

Ingredients to process:
${ingredients.join('\n')}

Return ONLY a JSON array of objects with the following structure, and nothing else.
[
  {
    "category": "Produce",
    "items": ["3 onions", "1 bunch basil"]
  },
  {
    "category": "Dairy",
    "items": ["500ml milk", "200g cheddar"]
  }
]`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.1 }
    });

    const parsed = JSON.parse(response.text || '[]');
    return res.status(200).json({ list: parsed });
  } catch (error: any) {
    console.error('Shopping list error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate shopping list' });
  }
}
