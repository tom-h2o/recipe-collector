import { GoogleGenAI, ThinkingLevel, type Part, type Schema, type ThinkingConfig } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { captureException } from './sentry.js';

export interface GeminiLogContext {
  supabase: SupabaseClient;
  endpoint: string;
  recipeId?: string | null;
  userId?: string | null;
}

/** The model behind recipes.embedding (768 values). Not user-selectable. */
export const EMBEDDING_MODEL = 'gemini-embedding-2';

/**
 * How much one AI call reasoned, as recorded in gemini_logs.thinking
 * (migration 0067):
 *   on       the model's default; the task did not ask for less
 *   off      switched off (thinkingBudget 0, Gemini 2.5 only)
 *   minimal  the lowest level a Gemini 3 model offers; not guaranteed to be none
 *   low      the lowest level this model offers (every Gemini 4 model)
 *   refused  every lower setting was refused, so it ran at the default
 */
export type ThinkingState = 'on' | 'off' | 'minimal' | 'low' | 'refused';

export interface ReasoningStep {
  config: ThinkingConfig;
  state: ThinkingState;
}

/**
 * The settings that lower a model's reasoning, most reduced first.
 *
 * Only Gemini 2.5 can switch reasoning off, with a zero thinkingBudget. From
 * Gemini 3 on the numeric budget is legacy and reasoning can only be lowered,
 * by thinkingLevel; gemini-3.5-flash-lite answered a zero budget with a bare
 * "400 Request contains an invalid argument", which is what the System tab
 * caught. Google's table (aistudio.google.com/docs/thinking) lists `minimal`
 * for most Gemini 3 models but not for any Gemini 4 model, gemini-3.8-flash or
 * the Pro models, whose lowest level is `low`. An id this does not recognise
 * gets `minimal` first and steps down to `low` if refused.
 */
export function reducedReasoningSteps(model: string): ReasoningStep[] {
  if (/^gemini-2[.-]/.test(model)) return [{ config: { thinkingBudget: 0 }, state: 'off' }];
  const low: ReasoningStep = { config: { thinkingLevel: ThinkingLevel.LOW }, state: 'low' };
  if (/^gemini-4-|^gemini-3\.8-|-pro(-|$)/.test(model)) return [low];
  return [{ config: { thinkingLevel: ThinkingLevel.MINIMAL }, state: 'minimal' }, low];
}

/**
 * Which step each model accepted, so a warm function does not walk into the
 * same 400 on every call. steps.length means none was accepted.
 */
const acceptedStep = new Map<string, number>();

/** For tests: forget what each model accepted. */
export function forgetReasoningSteps(): void {
  acceptedStep.clear();
}

/**
 * Whether the provider refused the request as invalid, which while a lower
 * reasoning setting is being sent is most likely that setting. Deliberately
 * any 400: the refusal of a zero budget by gemini-3.5-flash-lite does not
 * mention thinking at all. A request wrong for some other reason costs one
 * fast failing call per remaining step and then fails as before.
 */
export function refusesReasoningSetting(err: unknown): boolean {
  const { code, status } = errorCodeAndStatus(err);
  return code === 400 || status === 'INVALID_ARGUMENT';
}

function describeStep(step: ReasoningStep): string {
  return step.config.thinkingBudget === 0 ? 'thinking budget 0' : `level ${String(step.config.thinkingLevel).toLowerCase()}`;
}

/**
 * Sends a request with reasoning as low as the model accepts: each step in
 * turn, the next on a 400, and finally with no reasoning setting at all
 * ('refused'). `send` is called with the thinkingConfig to use.
 */
export async function withReducedReasoning<T>(
  model: string,
  send: (thinkingConfig: ThinkingConfig | undefined) => Promise<T>,
  options: { fresh?: boolean; onStep?: (state: ThinkingState) => void } = {},
): Promise<{ value: T; state: ThinkingState; config: ThinkingConfig | undefined; refused: string[] }> {
  const steps = reducedReasoningSteps(model);
  const from = options.fresh ? 0 : Math.min(acceptedStep.get(model) ?? 0, steps.length);
  const refused: string[] = [];
  for (let i = from; i < steps.length; i++) {
    options.onStep?.(steps[i].state);
    try {
      const value = await send(steps[i].config);
      acceptedStep.set(model, i);
      return { value, state: steps[i].state, config: steps[i].config, refused };
    } catch (err) {
      if (!refusesReasoningSetting(err)) throw err;
      refused.push(describeStep(steps[i]));
    }
  }
  options.onStep?.('refused');
  const value = await send(undefined);
  acceptedStep.set(model, steps.length);
  return { value, state: 'refused', config: undefined, refused };
}

/**
 * Writes one gemini_logs row. Never throws, and resolves once written.
 *
 * Code reaches production minutes before the migration job adds a column, and
 * an insert naming a column the table does not have yet is refused whole —
 * silently, since callers do not wait for it. The daily allowance is counted
 * from these rows, so losing them would hand out free calls. A row refused
 * for the `thinking` column is therefore written again without it.
 */
export async function insertGeminiLog(supabase: SupabaseClient, row: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await supabase.from('gemini_logs').insert(row);
    if (error && 'thinking' in row && /thinking/i.test(`${error.message ?? ''} ${error.details ?? ''}`)) {
      const { thinking: _unrecorded, ...rest } = row;
      void _unrecorded;
      await supabase.from('gemini_logs').insert(rest);
    }
  } catch {
    // Logging must never fail the call it describes.
  }
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
   * Upper bound on total time spent across attempts, so a retry the platform
   * kills mid-flight is never started.
   *
   * This was 7000ms, chosen from a guess about the serverless ceiling that the
   * logs disprove: a translate call has completed successfully at 124 seconds.
   * The effect was that retrying never once worked for extract — its calls take
   * 10-53s, so the very first failure had already blown a 7s budget and the
   * retry was skipped. Every 503 on the slowest and most valuable endpoint went
   * straight to the user as a hard failure.
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
  // Comfortably above the slowest call seen in gemini_logs (124s succeeded),
  // leaving room for a retry of anything that failed inside ~50s.
  deadlineMs: 110_000,
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
    const attemptStartedAt = Date.now();
    try {
      onAttempt(attempt);
      return { value: await fn(), attempts: attempt };
    } catch (err) {
      if (attempt >= maxAttempts || !isTransientGeminiError(err)) throw err;

      // Exponential, with jitter so several callers retrying the same overloaded
      // model do not all come back at the same instant.
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const delay = backoff + Math.random() * backoff * 0.25;

      // Budget for the retry actually taking about as long as the attempt that
      // just failed, rather than treating it as free. Comparing only elapsed
      // time against the deadline would start a retry with no room to finish,
      // and the platform would kill it mid-flight — a slower failure, and a
      // wasted call against the daily allowance.
      const likelyCost = Date.now() - attemptStartedAt;
      if (Date.now() - startedAt + delay + likelyCost > deadlineMs) throw err;
      await sleep(delay);
    }
  }
}

/**
 * The free tiers, by id. Kept equal to the first two entries of OFFERED_MODELS
 * (api/_lib/supabase.ts) by gemini.test.ts; not imported from there because
 * every endpoint test mocks that module.
 */
const LITE_MODEL = 'gemini-3.5-flash-lite';
const STANDARD_MODEL = 'gemini-4-hydrogen';

/**
 * The model to ask when the chosen one cannot answer right now.
 *
 * Each model has its own capacity and its own free quota, so "Gemini is down"
 * is usually one model: the System tab has shown Standard answering 503 while
 * Lite was fine. Standard and Lite stand in for each other; anything else
 * (Frontier, which has no free allowance, or an id someone typed) falls back
 * to Standard. Never to Frontier: on a key without billing it fails every call.
 */
export function fallbackModelFor(model: string): string {
  return model === STANDARD_MODEL ? LITE_MODEL : STANDARD_MODEL;
}

/**
 * True when the failure is about the model being unable to serve, not about
 * the request: overloaded or failing (the transient set, which includes 429
 * for a used-up quota) or gone (404). A 403 is left out on purpose: a project
 * Google has blocked is blocked for every model, and a 400 would fail the same
 * way on any of them.
 */
export function modelCannotServe(err: unknown): boolean {
  if (isTransientGeminiError(err)) return true;
  const { code, status } = errorCodeAndStatus(err);
  return code === 404 || status === 'NOT_FOUND';
}

/**
 * Runs `run` on `model` and, if that model cannot serve, once more on
 * fallbackModelFor(model).
 *
 * `run` is given the time it may spend, so the two runs together stay inside
 * one deadline. The fallback is only started if it is likely to finish: like
 * callWithRetry, it budgets for the second run costing about what the first
 * one did. One call is still one gemini_logs row; the caller logs the model
 * that answered.
 */
export async function withModelFallback<T>(
  model: string,
  run: (model: string, budgetMs: number) => Promise<T>,
  options: { deadlineMs?: number; onFallback?: (from: string, to: string, err: unknown) => void } = {},
): Promise<{ value: T; model: string }> {
  const deadlineMs = options.deadlineMs ?? DEFAULT_RETRY.deadlineMs;
  const startedAt = Date.now();
  try {
    return { value: await run(model, deadlineMs), model };
  } catch (err) {
    const alternative = fallbackModelFor(model);
    const elapsed = Date.now() - startedAt;
    if (alternative === model || !modelCannotServe(err) || elapsed * 2 > deadlineMs) throw err;
    options.onFallback?.(model, alternative, err);
    return { value: await run(alternative, deadlineMs - elapsed), model: alternative };
  }
}

/**
 * One structured request with files attached (photos, a PDF), retried and
 * falling back to the other free model exactly as generateJson does.
 *
 * Photo and PDF extraction log their own row and used to call
 * generateContent directly, so they were the one place a 503 was never
 * retried: an overloaded model failed a photo on the first try while every
 * text task waited and tried again. `progress` is updated as the call runs, so
 * the caller can log the attempts and the model even when it throws.
 */
export async function generateFromParts(
  client: GoogleGenAI,
  model: string,
  parts: Part[],
  options: { responseSchema?: Schema; temperature?: number } & RetryOptions = {},
  progress: { attempts: number; model: string } = { attempts: 0, model },
): Promise<{ text: string | undefined; modelVersion: string | undefined }> {
  const { responseSchema, temperature = 0.1, ...retry } = options;
  progress.model = model;
  const { value } = await withModelFallback(model, (m, budgetMs) => {
    progress.model = m;
    return callWithRetry(
      () => client.models.generateContent({
        model: m,
        contents: [{ role: 'user', parts }],
        config: { responseMimeType: 'application/json', temperature, ...(responseSchema ? { responseSchema } : {}) },
      }),
      { ...retry, deadlineMs: budgetMs, onAttempt: () => { progress.attempts += 1; } },
    ).then((r) => r.value);
  }, { deadlineMs: retry.deadlineMs });
  return { text: value.text, modelVersion: value.modelVersion };
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

export function errorCodeAndStatus(err: unknown): { code?: number; status?: string } {
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
  /**
   * Whether the model may reason at its default level before answering.
   * False asks for the lowest level it accepts (reducedReasoningSteps).
   *
   * Gemini 4 thinks by default, which is paid for twice: in latency, and in
   * the chance that the reasoning leaks into the answer — a recipe title came
   * back as "Vegan Chocolate Mousse``` Wait! I almost output extra text and
   * markdown!...". For a task that rewrites given text into a given shape,
   * there is nothing to reason about.
   *
   * Left on by default so this is opt-out per endpoint rather than a silent
   * change to all of them: extraction from messy HTML may genuinely benefit.
   */
  thinking?: boolean;
  /**
   * A check on the parsed answer for what the response schema cannot express.
   * Throw to refuse it.
   *
   * A refused answer is asked for once more *inside this call*, so the user is
   * charged one of their daily hundred for one action: the allowance is
   * derived by counting gemini_logs rows, and this call still writes exactly
   * one, with `attempts` recording what it really took. Doing the second ask
   * from the endpoint would write a second row. A second refusal is thrown to
   * the caller and nothing is returned.
   */
  validate?: (value: unknown) => void;
}

export async function generateJson<T = unknown>(
  client: GoogleGenAI,
  model: string,
  prompt: string,
  logCtx?: GeminiLogContext,
  options: GenerateOptions = {},
): Promise<T> {
  const { responseSchema, thinking = true, validate, ...retry } = options;
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
  /** What the log row records; updated as lower reasoning settings are tried. */
  let thinkingState: ThinkingState = thinking ? 'on' : 'off';
  /**
   * The model that answered the first request: `model`, or its fallback when
   * `model` could not serve (withModelFallback). The repair and the re-ask go
   * to the same one, and the log row records it.
   */
  let activeModel = model;
  /**
   * The reasoning setting settled on by the first request, reused by the
   * repair and the re-ask so they do not walk into the same 400 again.
   */
  let settled: { config: ThinkingConfig | undefined } | null = null;

  /** One request to model `m`, with transient failures retried. */
  const send = (m: string, contents: string, temperature: number, deadlineMs?: number) =>
    async (thinkingConfig: ThinkingConfig | undefined) => (await callWithRetry(
      () => client.models.generateContent({
        model: m,
        contents,
        config: { responseMimeType: 'application/json', temperature, ...(responseSchema ? { responseSchema } : {}), ...(thinkingConfig ? { thinkingConfig } : {}) },
      }),
      { ...retry, ...(deadlineMs !== undefined ? { deadlineMs } : {}), onAttempt: () => { attempts += 1; } },
    )).value;

  /**
   * One request to the model. The first decides the model (falling back if the
   * chosen one cannot serve) and the reasoning setting; later ones reuse both.
   */
  const ask = async (contents: string, temperature: number) => {
    let response;
    if (settled) {
      response = await send(activeModel, contents, temperature)(settled.config);
    } else {
      const first = await withModelFallback(model, async (m, budgetMs) => {
        const sendTo = send(m, contents, temperature, budgetMs);
        if (thinking) return { response: await sendTo(undefined), config: undefined };
        thinkingState = 'off';
        const r = await withReducedReasoning(m, sendTo, { onStep: (state) => { thinkingState = state; } });
        return { response: r.value, config: r.config };
      }, { deadlineMs: retry.deadlineMs });
      activeModel = first.model;
      response = first.value.response;
      settled = { config: first.value.config };
    }
    modelVersion = response.modelVersion ?? modelVersion;
    return response.text;
  };

  /** Asks for an answer and parses it, repairing malformed JSON once. */
  const produce = async (): Promise<T> => {
    const text = await ask(prompt, 0.1);
    if (!text) throw new Error('Gemini returned an empty response.');
    outputPreview = text;
    try {
      return parseJson<T>(text);
    } catch (parseErr) {
      const repairedText = await ask(
        `Repair the following invalid JSON and return only valid JSON. Do not change the data unless needed to make it syntactically valid.\n\nParse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}\n\nInvalid JSON:\n${text}`,
        0,
      );
      if (!repairedText) throw parseErr;
      outputPreview = repairedText;
      return parseJson<T>(repairedText);
    }
  };

  try {
    const value = await produce();
    if (!validate) return value;
    try {
      validate(value);
      return value;
    } catch {
      // Refused once: ask again. A second refusal is the caller's to report.
      const second = await produce();
      validate(second);
      return second;
    }
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
    captureException(err);
    throw err;
  } finally {
    if (logCtx) {
      void insertGeminiLog(logCtx.supabase, {
        endpoint: logCtx.endpoint,
        // The model that answered, which is `model` unless it could not serve.
        model: activeModel,
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
        thinking: thinkingState,
      });
    }
  }
}
