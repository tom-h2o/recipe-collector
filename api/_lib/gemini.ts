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

/**
 * Turns a provider failure into something a user can act on.
 *
 * The frontend shows `error` from the response body verbatim, and every
 * endpoint passed `err.message` straight through — which for a Gemini failure
 * is the raw API envelope. On 15 September 2026 three calls failed and what
 * reached the user was:
 *
 *   {"error":{"code":403,"message":"Your project has been denied access.
 *    Please contact support.","status":"PERMISSION_DENIED"}}
 *
 * That tells a cook nothing, and worse, it reads as though their recipe is at
 * fault. These messages say whose problem it is and whether retrying helps.
 *
 * Returns the HTTP status to send as well: a provider outage is a 503 from us,
 * not a 500, because nothing about the request was wrong.
 */
export interface DescribedError {
  status: number;
  message: string;
  /** False for configuration or quota faults, where retrying changes nothing. */
  retryable: boolean;
}

function errorCodeAndStatus(err: unknown): { code?: number; status?: string } {
  const out: { code?: number; status?: string } = {};
  // This runs inside a catch block. Throwing here would turn a handled failure
  // into an unhandled one, so a null or non-object `err` must fall straight
  // through to the caller's fallback wording.
  if (err === null || (typeof err !== 'object' && typeof err !== 'string')) return out;

  const e = (typeof err === 'string' ? { message: err } : err) as {
    status?: unknown; code?: unknown; message?: unknown;
  };

  if (typeof e.code === 'number') out.code = e.code;
  if (typeof e.status === 'number') out.code = e.status;
  if (typeof e.status === 'string') out.status = e.status;

  const message = typeof e.message === 'string' ? e.message : '';
  if (message) {
    try {
      const parsed = JSON.parse(message) as { error?: { code?: number; status?: string } };
      if (typeof parsed.error?.code === 'number') out.code = parsed.error.code;
      if (typeof parsed.error?.status === 'string') out.status = parsed.error.status;
    } catch {
      // Not every SDK error carries a JSON body; the fields above still apply.
    }
  }
  return out;
}

export function describeGeminiError(err: unknown, fallback: string): DescribedError {
  const { code, status } = errorCodeAndStatus(err);

  // Configuration: the project or key is rejected. Nobody using the app can fix
  // this and retrying will fail identically, so say so plainly.
  if (code === 401 || code === 403 || status === 'PERMISSION_DENIED' || status === 'UNAUTHENTICATED') {
    return {
      status: 503,
      message: 'The AI service is not available right now because of a configuration problem on our side. Nothing is wrong with your recipe — please try again later.',
      retryable: false,
    };
  }

  // Google's own quota, distinct from this app's 100/day allowance, which is
  // checked before any call is made and returns its own 429.
  if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
    return {
      status: 503,
      message: 'The AI service has hit its usage limit for now. Please try again later.',
      retryable: false,
    };
  }

  // Transient and already retried by callWithRetry before reaching here.
  if (code === 500 || code === 502 || code === 503 || code === 504
      || status === 'UNAVAILABLE' || status === 'INTERNAL' || status === 'DEADLINE_EXCEEDED') {
    return {
      status: 503,
      message: 'The AI service is busy. This usually clears in a minute — please try again.',
      retryable: true,
    };
  }

  // A model id that no longer serves requests, which is how
  // gemini-2.5-flash-lite behaved (migration 0044).
  if (code === 404 || status === 'NOT_FOUND') {
    return {
      status: 503,
      message: 'The configured AI model is unavailable. This is a configuration problem on our side.',
      retryable: false,
    };
  }

  // Unrecognised, and no provider code or status was found — so this is one of
  // our own errors, such as a Zod validation failure on the model's output
  // ("Invalid Gemini nutrition output: expected number, received NaN"). That
  // wording was written deliberately and says more than a generic fallback, so
  // it is kept.
  //
  // The one thing never passed through is something shaped like the provider's
  // JSON envelope, whatever this function managed to parse out of it.
  const raw = err instanceof Error ? err.message : '';
  if (raw && !raw.trimStart().startsWith('{')) {
    return { status: 500, message: raw, retryable: true };
  }
  return { status: 500, message: fallback, retryable: true };
}

export interface GenerateOptions extends RetryOptions {
  /**
   * Constrains the model's output shape. Without it `responseMimeType` only asks
   * for JSON and the model can still emit something unparseable — the cause of
   * four of the five failures ever recorded in gemini_logs.
   */
  responseSchema?: unknown;
}

export async function generateJson<T = unknown>(
  client: GoogleGenAI,
  model: string,
  prompt: string,
  logCtx?: GeminiLogContext,
  options: GenerateOptions = {},
): Promise<T> {
  const { responseSchema, ...retry } = options;
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
        config: { responseMimeType: 'application/json', temperature: 0.1, ...(responseSchema ? { responseSchema } : {}) },
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
          config: { responseMimeType: 'application/json', temperature: 0, ...(responseSchema ? { responseSchema } : {}) },
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
