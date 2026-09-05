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


/**
 * Errors worth trying again: Google is overloaded, throttling, or had a
 * transient backend fault. A 503 "This model is currently experiencing high
 * demand… please try again later" reached a user as a plain failure before this
 * existed, because nothing acted on the advice in the message.
 *
 * Deliberately narrow. A 400, a 404 for a retired model id, or an auth failure
 * will fail identically every time, and retrying them only burns the caller's
 * time before showing the same error.
 */
const TRANSIENT_HTTP_CODES = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_STATUSES = new Set([
  'UNAVAILABLE',
  'RESOURCE_EXHAUSTED',
  'INTERNAL',
  'DEADLINE_EXCEEDED',
  'ABORTED',
]);

export function isTransientGeminiError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: unknown; code?: unknown; message?: unknown };

  for (const v of [e.status, e.code]) {
    if (typeof v === 'number' && TRANSIENT_HTTP_CODES.has(v)) return true;
    if (typeof v === 'string' && TRANSIENT_STATUSES.has(v)) return true;
  }

  // The SDK surfaces the API's JSON body as the message, e.g.
  // {"error":{"code":503,"message":"…","status":"UNAVAILABLE"}}
  const message = typeof e.message === 'string' ? e.message : '';
  if (!message) return false;
  try {
    const parsed = JSON.parse(message) as { error?: { code?: number; status?: string } };
    const code = parsed.error?.code;
    const status = parsed.error?.status;
    if (typeof code === 'number' && TRANSIENT_HTTP_CODES.has(code)) return true;
    if (typeof status === 'string' && TRANSIENT_STATUSES.has(status)) return true;
  } catch {
    // Not JSON — fall through to the textual check below.
  }
  return [...TRANSIENT_STATUSES].some((s) => message.includes(s));
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /**
   * Stop retrying once this much time has passed since the first attempt. A
   * retry the platform kills mid-flight helps nobody, so this stays well inside
   * the serverless execution ceiling.
   */
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Called as each attempt begins. Returning the count only on success is not
   * enough: a call that exhausts its retries throws, and the caller would then
   * log zero attempts for work that really did hit the API three times.
   */
  onAttempt?: (attempt: number) => void;
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 400,
  deadlineMs: 7000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onAttempt: () => {},
};

/**
 * Runs `fn`, retrying transient failures with exponential backoff.
 *
 * Returns the attempt count alongside the value so the caller can record it on
 * the single log row this call produces. Retries must never write their own row:
 * the daily allowance is derived by counting gemini_logs rows, so a retried call
 * would otherwise cost the user two or three of their hundred.
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<{ value: T; attempts: number }> {
  const { maxAttempts, baseDelayMs, deadlineMs, sleep, onAttempt } = { ...DEFAULT_RETRY, ...options };
  const startedAt = Date.now();

  for (let attempt = 1; ; attempt++) {
    try {
      onAttempt(attempt);
      return { value: await fn(), attempts: attempt };
    } catch (err) {
      if (attempt >= maxAttempts || !isTransientGeminiError(err)) throw err;

      // Exponential, with jitter so several callers retrying the same overloaded
      // model do not all come back at the same instant.
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const delay = backoff + Math.random() * backoff * 0.25;
      if (Date.now() - startedAt + delay > deadlineMs) throw err;
      await sleep(delay);
    }
  }
}

export async function generateJson<T = unknown>(
  client: GoogleGenAI,
  model: string,
  prompt: string,
  logCtx?: GeminiLogContext,
  retry: RetryOptions = {},
): Promise<T> {
  const startTime = Date.now();
  let status: 'success' | 'error' = 'success';
  let outputPreview: string | undefined;
  let errorMessage: string | undefined;
  /**
   * The concrete model Google actually ran. `model` may be an alias such as
   * gemini-flash-latest, which moves to a new release without a code change;
   * recording this is what makes that safe to rely on.
   */
  let modelVersion: string | undefined;
  /** Model calls made, including retries. Recorded on the one log row below. */
  let attempts = 0;

  try {
    const first = await callWithRetry(
      () => client.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
      { ...retry, onAttempt: () => { attempts += 1; } },
    );
    const response = first.value;
    modelVersion = response.modelVersion ?? undefined;
    const text = response.text;
    if (!text) throw new Error('Gemini returned an empty response.');
    outputPreview = text;
    try {
      return parseJson<T>(text);
    } catch (parseErr) {
      const repaired = await callWithRetry(
        () => client.models.generateContent({
          model,
          contents: `Repair the following invalid JSON and return only valid JSON. Do not change the data unless needed to make it syntactically valid.\n\nParse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}\n\nInvalid JSON:\n${text}`,
          config: { responseMimeType: 'application/json', temperature: 0 },
        }),
        { ...retry, onAttempt: () => { attempts += 1; } },
      );
      const repairResponse = repaired.value;
      modelVersion = repairResponse.modelVersion ?? modelVersion;
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
          model_version: modelVersion ?? null,
          attempts,
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
