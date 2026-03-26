import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';

// Initialize Gemini Client
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!ai) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the Vercel server.' });
    }

    console.log(`Fetching URL: ${url}`);
    
    // Fetch the webpage content securely
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract metadata
    const title = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
    const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    
    // Scrape body text but remove bloated script/style tags
    $('script, style, nav, footer, iframe, svg').remove();
    // Grab text and limit to 20k characters to stay within reasonable prompt sizes 
    // (though Gemini 2.5 Flash has a 1M token context, saving tokens is good)
    const bodyText = $('body').text().replace(/\s+/g, ' ').substring(0, 20000); 
    
    const combinedContent = `
Title: ${title}
Description: ${description}
OG Image: ${ogImage}

Body Text:
${bodyText}
    `;

    console.log(`Processing with Gemini...`);

    const prompt = `
You are a culinary assistant that extracts recipes from raw extracted webpage text.
Your task is to find the recipe within the text below and return it strictly formatted as a JSON object.

The JSON MUST match this exact structure:
{
  "title": "Recipe Title",
  "description": "Short summary of the dish",
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": "Step 1. Do this.\\nStep 2. Do that.",
  "image_url": "extract a high quality image url from the content if possible (prefer OG Image), otherwise an empty string"
}

If the webpage text comes from an Instagram post, the recipe might be embedded entirely in the Description text. Extract it accurately!

Webpage Text to Extract From:
${combinedContent}
    `;

    // Call Gemini 2.5 Flash
    const responseAI = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            temperature: 0.1, // Low temp for more accurate extraction
        }
    });

    const resultText = responseAI.text;
    
    if (!resultText) {
        throw new Error('Gemini returned an empty response.');
    }

    const recipeData = JSON.parse(resultText);
    return res.status(200).json(recipeData);

  } catch (error: any) {
    console.error('Extraction error:', error);
    return res.status(500).json({ error: error.message || 'Failed to extract recipe from URL' });
  }
}
