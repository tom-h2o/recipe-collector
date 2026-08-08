import { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { captureException } from './sentry.js';

export interface GeminiLogContext {
  supabase: SupabaseClient;
  endpoint: string;
  recipeId?: string | null;
  userId?: string | null;
}

export function getGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

function extractJsonCandidate(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  const firstObject = trimmed.indexOf('{');
  const firstArray = trimmed.indexOf('[');
  const startsAt = firstObject === -1 ? firstArray : firstArray === -1 ? firstObject : Math.min(firstObject, firstArray);
  if (startsAt === -1) return trimmed;

  const opening = trimmed[startsAt];
  const closing = opening === '{' ? '}' : ']';
  const endsAt = trimmed.lastIndexOf(closing);
  return endsAt > startsAt ? trimmed.slice(startsAt, endsAt + 1) : trimmed;
}

function parseJson<T>(text: string): T {
  return JSON.parse(extractJsonCandidate(text)) as T;
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
    outputPreview = text;
    try {
      return parseJson<T>(text);
    } catch (parseErr) {
      const repairResponse = await client.models.generateContent({
        model,
        contents: `Repair the following invalid JSON and return only valid JSON. Do not change the data unless needed to make it syntactically valid.\n\nParse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}\n\nInvalid JSON:\n${text}`,
        config: { responseMimeType: 'application/json', temperature: 0 },
      });
      const repairedText = repairResponse.text;
      if (!repairedText) throw parseErr;
      outputPreview = repairedText;
      return parseJson<T>(repairedText);
    }
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
          input: prompt,
          output: outputPreview ?? null,
          input_preview: prompt.substring(0, 300),
          output_preview: outputPreview ? outputPreview.substring(0, 300) : null,
          error_message: errorMessage ?? null,
          recipe_id: logCtx.recipeId ?? null,
          user_id: logCtx.userId ?? null,
        })
        .then(() => {}, () => {});
    }
  }
}
