import { GoogleGenAI } from '@google/genai';
import { captureException } from './sentry.js';

export function getGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

export async function generateJson<T = unknown>(
  client: GoogleGenAI,
  model: string,
  prompt: string,
): Promise<T> {
  try {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.1 },
    });
    const text = response.text;
    if (!text) throw new Error('Gemini returned an empty response.');
    return JSON.parse(text) as T;
  } catch (err) {
    captureException(err);
    throw err;
  }
}
