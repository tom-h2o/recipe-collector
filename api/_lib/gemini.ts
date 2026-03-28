import { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { captureException } from './sentry.js';

export interface GeminiLogContext {
  supabase: SupabaseClient;
  endpoint: string;
  recipeId?: string | null;
}

export function getGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

export async function generateJson<T = unknown>(
  client: GoogleGenAI,
  model: string,
  prompt: string,
  logCtx?: GeminiLogContext,
): Promise<T> {
  const startTime = Date.now();
  let status: 'success' | 'error' = 'success';
  let outputPreview: string | undefined;
  let errorMessage: string | undefined;

  try {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.1 },
    });
    const text = response.text;
    if (!text) throw new Error('Gemini returned an empty response.');
    outputPreview = text.substring(0, 300);
    return JSON.parse(text) as T;
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
    captureException(err);
    throw err;
  } finally {
    if (logCtx) {
      logCtx.supabase
        .from('gemini_logs')
        .insert({
          endpoint: logCtx.endpoint,
          model,
          status,
          latency_ms: Date.now() - startTime,
          input_preview: prompt.substring(0, 300),
          output_preview: outputPreview ?? null,
          error_message: errorMessage ?? null,
          recipe_id: logCtx.recipeId ?? null,
        })
        .then(() => {}, () => {});
    }
  }
}
