/**
 * The admin System tab: is every part of the app configured, reachable and
 * answering? Two halves, because one of them costs money.
 *
 * - configReport() and reasoningReport() are free: they read environment
 *   variables and the database, and run whenever the tab opens.
 * - runLiveCheck() makes real calls — one tiny request per Gemini model, one
 *   embedding, one Unsplash search — and only runs when the admin presses
 *   "Run check". Each Gemini call is logged as `health-check`, which
 *   NON_AI_ENDPOINTS keeps out of the daily allowance.
 *
 * Nothing here ever returns the value of a secret: configuration is reported
 * as set or missing, by variable name.
 */
import type { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ThinkingConfig } from '@google/genai';
import { EMBEDDING_MODEL, errorCodeAndStatus, insertGeminiLog, withReducedReasoning, type ThinkingState } from './gemini.js';
import { AI_TASK_IDS, OFFERED_MODELS, modelFor, thinkingFor, type AiTask, type Settings } from './supabase.js';

/**
 * The newest migration this code expects the database to have. Compared with
 * what system_health() reads from supabase_migrations, so a deploy whose
 * migration job failed shows up here instead of as odd errors elsewhere.
 * tests/unit/systemCheck.test.ts fails when a newer migration file exists.
 */
export const EXPECTED_SCHEMA = '0067';

/** How long one probe may take. A healthy call answers in a second or two. */
export const PROBE_TIMEOUT_MS = 25_000;

/** The gemini_logs endpoint for every probe; listed in NON_AI_ENDPOINTS. */
export const HEALTH_ENDPOINT = 'health-check';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skipped';

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  latency_ms?: number | null;
}

// ── Configuration ───────────────────────────────────────────────────────────

interface ConfigItem {
  id: string;
  label: string;
  /** Checked in order; the first that is set is the one reported. */
  names: string[];
  required: boolean;
  /** What stops working without it, said plainly. */
  missing: string;
}

const CONFIG: ConfigItem[] = [
  { id: 'supabase-url', label: 'Supabase URL', names: ['VITE_SUPABASE_URL'], required: true, missing: 'Nothing can reach the database.' },
  { id: 'supabase-anon-key', label: 'Supabase public key', names: ['VITE_SUPABASE_ANON_KEY'], required: true, missing: 'The app cannot sign anyone in.' },
  { id: 'supabase-service-key', label: 'Supabase service key', names: ['SUPABASE_SERVICE_KEY'], required: true, missing: 'The server functions fall back to the public key, and row-level security refuses most of what they do.' },
  { id: 'gemini-key', label: 'Gemini API key', names: ['GEMINI_API_KEY_1', 'GEMINI_API_KEY'], required: true, missing: 'Every AI feature fails.' },
  { id: 'admin-email', label: 'Admin email', names: ['VITE_ADMIN_EMAIL'], required: true, missing: 'Nobody can open this panel.' },
  { id: 'unsplash-key', label: 'Unsplash key', names: ['UNSPLASH_ACCESS_KEY'], required: false, missing: 'Image search is off.' },
  { id: 'sentry-server', label: 'Sentry, server', names: ['SENTRY_DSN'], required: false, missing: 'Errors in the server functions are not reported anywhere.' },
  { id: 'sentry-browser', label: 'Sentry, browser', names: ['VITE_SENTRY_DSN'], required: false, missing: 'Errors in the app itself are not reported anywhere.' },
  { id: 'allowed-origin', label: 'Allowed origin (CORS)', names: ['ALLOWED_ORIGIN'], required: false, missing: 'Any website may call the API. Sign-in still protects it, because the token travels in a header rather than a cookie.' },
];

export function configReport(env: Record<string, string | undefined> = process.env): CheckResult[] {
  return CONFIG.map(({ id, label, names, required, missing }) => {
    const set = names.find((n) => (env[n] ?? '').trim() !== '');
    if (set) return { id, label, status: 'ok', detail: `Set (${set}).` };
    return { id, label, status: required ? 'fail' : 'warn', detail: `${names.join(' or ')} is not set. ${missing}` };
  });
}

// ── Reasoning per task ──────────────────────────────────────────────────────

/** gemini_logs endpoints are task names, except extraction, which logs its source. */
export function taskForEndpoint(endpoint: string): AiTask | null {
  if (endpoint === 'extract' || endpoint.startsWith('extract-')) return 'extract';
  return (AI_TASK_IDS as readonly string[]).includes(endpoint) ? (endpoint as AiTask) : null;
}

export interface UsageRow {
  endpoint: string;
  model: string;
  thinking: string;
  call_count: number | string;
}

export interface ReasoningUsage {
  model: string;
  on: number;
  off: number;
  minimal: number;
  low: number;
  refused: number;
  /** Calls logged before migration 0067 recorded this. */
  unrecorded: number;
}

export interface ReasoningRow {
  task: AiTask;
  /** As configured: REASONING_OFF_TASKS, through thinkingFor(). */
  reasoning: 'on' | 'off';
  /** The model this task runs on for the admin's own settings. */
  model: string;
  /** What the logs say actually happened, per model, over the period. */
  usage: ReasoningUsage[];
}

export function reasoningReport(settings: Settings, rows: UsageRow[] | null): ReasoningRow[] {
  const byTask = new Map<AiTask, Map<string, ReasoningUsage>>();
  for (const row of rows ?? []) {
    const task = taskForEndpoint(row.endpoint);
    if (!task) continue;
    const models = byTask.get(task) ?? new Map<string, ReasoningUsage>();
    const usage = models.get(row.model) ?? { model: row.model, on: 0, off: 0, minimal: 0, low: 0, refused: 0, unrecorded: 0 };
    const key = (['on', 'off', 'minimal', 'low', 'refused'] as const).find((k) => k === row.thinking) ?? 'unrecorded';
    usage[key] += Number(row.call_count) || 0;
    models.set(row.model, usage);
    byTask.set(task, models);
  }
  return AI_TASK_IDS.map((task) => ({
    task,
    reasoning: thinkingFor(task) ? 'on' : 'off',
    model: modelFor(settings, task),
    usage: [...(byTask.get(task)?.values() ?? [])].sort((a, b) => a.model.localeCompare(b.model)),
  }));
}

// ── Live checks ─────────────────────────────────────────────────────────────

export interface SystemHealth {
  postgres_version?: string | null;
  pgvector_version?: string | null;
  realtime_recipes?: boolean | null;
  latest_migration?: string | null;
  configured_models?: string[] | null;
}

async function timed<T>(fn: () => PromiseLike<T>): Promise<{ value?: T; error?: unknown; ms: number }> {
  const started = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - started };
  } catch (error) {
    return { error, ms: Date.now() - started };
  }
}

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

export function schemaCheck(health: SystemHealth | null, error: unknown): CheckResult {
  const base = { id: 'schema', label: 'Database schema' };
  if (error || !health) {
    return { ...base, status: 'fail', detail: `system_health() could not be called (${messageOf(error)}). Migration ${EXPECTED_SCHEMA} has probably not been applied: check the "Production Database Migration" job.` };
  }
  const versions = [health.postgres_version && `Postgres ${health.postgres_version.split(' ')[0]}`, health.pgvector_version && `pgvector ${health.pgvector_version}`].filter(Boolean).join(', ');
  const suffix = versions ? ` ${versions}.` : '';
  const latest = health.latest_migration;
  if (!latest) return { ...base, status: 'warn', detail: `The list of applied migrations cannot be read, so whether ${EXPECTED_SCHEMA} is applied is unknown.${suffix}` };
  if (latest < EXPECTED_SCHEMA) return { ...base, status: 'fail', detail: `At migration ${latest}, but this code expects ${EXPECTED_SCHEMA}. A migration has not been applied: check the "Production Database Migration" job.${suffix}` };
  if (latest > EXPECTED_SCHEMA) return { ...base, status: 'ok', detail: `At migration ${latest}, newer than this code expects (${EXPECTED_SCHEMA}) — normal while a deploy is under way.${suffix}` };
  return { ...base, status: 'ok', detail: `At migration ${latest}, as this code expects.${suffix}` };
}

export function realtimeCheck(health: SystemHealth | null): CheckResult {
  const base = { id: 'realtime', label: 'Realtime' };
  if (!health || health.realtime_recipes == null) return { ...base, status: 'skipped', detail: 'Unknown: the database could not be asked.' };
  return health.realtime_recipes
    ? { ...base, status: 'ok', detail: 'recipes is published, so a new card updates as soon as its tags and nutrition are saved.' }
    : { ...base, status: 'warn', detail: 'recipes is not in the Realtime publication (migration 0059). New cards still finish, through the 5-second poll.' };
}

async function checkDatabase(supabase: SupabaseClient): Promise<CheckResult> {
  const base = { id: 'database', label: 'Database' };
  const r = await timed(() => supabase.from('recipes').select('id', { count: 'exact', head: true }));
  const err = r.error ?? (r.value as { error?: unknown } | undefined)?.error;
  if (err) return { ...base, status: 'fail', detail: `Not reachable: ${messageOf(err)}`, latency_ms: r.ms };
  const count = (r.value as { count?: number | null }).count ?? 0;
  return { ...base, status: 'ok', detail: `Reachable. ${count} recipes.`, latency_ms: r.ms };
}

async function checkAuth(supabase: SupabaseClient): Promise<CheckResult> {
  const base = { id: 'auth', label: 'Sign-in (Supabase Auth)' };
  const r = await timed(() => supabase.auth.admin.listUsers({ page: 1, perPage: 1 }));
  const err = r.error ?? (r.value as { error?: unknown } | undefined)?.error;
  if (err) return { ...base, status: 'fail', detail: `Not reachable: ${messageOf(err)}`, latency_ms: r.ms };
  const total = ((r.value as { data?: { total?: number } }).data?.total) ?? null;
  return { ...base, status: 'ok', detail: total == null ? 'Reachable.' : `Reachable. ${total} accounts.`, latency_ms: r.ms };
}

async function checkStorage(supabase: SupabaseClient): Promise<CheckResult> {
  const base = { id: 'storage', label: 'Photo storage' };
  const r = await timed(() => supabase.storage.getBucket('recipe-images'));
  const value = r.value as { data?: { public?: boolean; file_size_limit?: number | null } | null; error?: unknown } | undefined;
  const err = r.error ?? value?.error;
  if (err || !value?.data) return { ...base, status: 'fail', detail: `The recipe-images bucket cannot be read: ${messageOf(err ?? 'not found')}`, latency_ms: r.ms };
  const limit = value.data.file_size_limit ? `, up to ${Math.round(value.data.file_size_limit / 1048576)} MB a file` : '';
  return { ...base, status: 'ok', detail: `recipe-images exists, ${value.data.public ? 'public' : 'private'}${limit}.`, latency_ms: r.ms };
}

export async function checkUnsplash(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const base = { id: 'unsplash', label: 'Image search (Unsplash)' };
  const key = env.UNSPLASH_ACCESS_KEY;
  if (!key) return { ...base, status: 'skipped', detail: 'No key is set, so image search is off.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const r = await timed(() => fetchImpl('https://api.unsplash.com/search/photos?query=food&per_page=1', {
    headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
    signal: controller.signal,
  }));
  clearTimeout(timer);
  if (r.error || !r.value) return { ...base, status: 'fail', detail: `Not reachable: ${messageOf(r.error)}`, latency_ms: r.ms };
  const res = r.value;
  if (res.status === 401) return { ...base, status: 'fail', detail: 'Unsplash refused the key (401).', latency_ms: r.ms };
  if (res.status === 403) return { ...base, status: 'warn', detail: 'The hourly limit is used up (403). Image search resumes when the hour turns.', latency_ms: r.ms };
  if (!res.ok) return { ...base, status: 'fail', detail: `Unexpected answer: HTTP ${res.status}.`, latency_ms: r.ms };
  const remaining = res.headers.get('x-ratelimit-remaining');
  const limit = res.headers.get('x-ratelimit-limit');
  return { ...base, status: 'ok', detail: remaining && limit ? `Reachable. ${remaining} of ${limit} requests left this hour.` : 'Reachable.', latency_ms: r.ms };
}

// ── Gemini ──────────────────────────────────────────────────────────────────

export interface ModelProbe {
  model: string;
  /** 'chat' for the models tasks run on, 'embedding' for recipe search. */
  kind: 'chat' | 'embedding';
  status: CheckStatus;
  detail: string;
  latency_ms: number | null;
  /** What Google says actually answered, when the id is an alias. */
  model_version: string | null;
  /**
   * The lowest reasoning setting the model accepted: off (Gemini 2.5),
   * minimal or low (Gemini 3 and later), or refused, meaning tasks set to run
   * without reasoning run at the model's default on it.
   */
  reasoning: ThinkingState | 'unknown' | 'n/a';
}

function isAbort(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

/** The provider's own short message, if the error carries its JSON envelope. */
function providerMessage(err: unknown): string {
  const raw = messageOf(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message.slice(0, 200);
  } catch {
    // not an envelope
  }
  return raw.slice(0, 200);
}

/**
 * What a failed probe means, for the admin. Deliberately more specific than
 * describeGeminiError(), which speaks to a cook and hides the provider.
 */
export function describeProbeFailure(err: unknown): { status: CheckStatus; detail: string } {
  if (isAbort(err)) return { status: 'warn', detail: `No answer within ${PROBE_TIMEOUT_MS / 1000} seconds.` };
  const { code, status } = errorCodeAndStatus(err);
  const said = providerMessage(err);
  if (code === 401 || code === 403 || status === 'PERMISSION_DENIED' || status === 'UNAUTHENTICATED') {
    return { status: 'fail', detail: `The key or the Google Cloud project was refused (${code ?? status}). Every task on this model fails. Google said: ${said}` };
  }
  if (code === 404 || status === 'NOT_FOUND') {
    return { status: 'fail', detail: `Google does not serve this model id (404): retired or misspelt. Google said: ${said}` };
  }
  if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
    return { status: 'warn', detail: `Quota used up (429). On a free-tier key a model may have no allowance at all and need billing. Google said: ${said}` };
  }
  if ((code && code >= 500) || status === 'UNAVAILABLE' || status === 'INTERNAL' || status === 'DEADLINE_EXCEEDED') {
    return { status: 'warn', detail: `Google is overloaded or failing right now (${code ?? status}); this usually clears within minutes. Google said: ${said}` };
  }
  return { status: 'fail', detail: `The request failed${code ? ` (${code})` : ''}: ${said}` };
}

interface ProbeContext {
  supabase: SupabaseClient;
  userId: string | null;
}

const PROBE_PROMPT = 'System check. Reply with exactly this JSON and nothing else: {"ok": true}';

const REASONING_DETAIL: Partial<Record<ThinkingState, string>> = {
  off: 'Answers, and accepts reasoning switched off.',
  minimal: 'Answers at the lowest reasoning level, minimal. From Gemini 3 on, reasoning can be lowered but not switched off.',
  low: 'Answers. The lowest reasoning level this model offers is low.',
  refused: 'Answers, but refused every lower reasoning setting: tasks meant to run without reasoning run at its default on this model.',
};

/**
 * One tiny request to a model, with reasoning as low as it accepts — the same
 * steps a real task takes (withReducedReasoning), started afresh so the result
 * is what the model says today rather than what this instance remembered.
 * Writes exactly one gemini_logs row, as generateJson does.
 */
export async function probeModel(client: GoogleGenAI, model: string, ctx: ProbeContext): Promise<ModelProbe> {
  const started = Date.now();
  let attempts = 0;
  let reasoning: ModelProbe['reasoning'] = 'unknown';
  let thinking: ThinkingState = 'off';
  let refused: string[] = [];
  let modelVersion: string | null = null;
  let text: string | undefined;
  let failure: unknown;

  const ask = async (thinkingConfig: ThinkingConfig | undefined) => {
    attempts += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      return await client.models.generateContent({
        model,
        contents: PROBE_PROMPT,
        config: {
          responseMimeType: 'application/json',
          temperature: 0,
          abortSignal: controller.signal,
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const result = await withReducedReasoning(model, ask, { fresh: true, onStep: (state) => { thinking = state; } });
    reasoning = result.state;
    refused = result.refused;
    modelVersion = result.value.modelVersion ?? null;
    text = result.value.text ?? '';
  } catch (err) {
    failure = err;
  }

  const latency = Date.now() - started;
  await insertGeminiLog(ctx.supabase, {
    endpoint: HEALTH_ENDPOINT,
    model,
    model_version: modelVersion,
    attempts,
    status: failure ? 'error' : 'success',
    latency_ms: latency,
    input: PROBE_PROMPT,
    output: text ?? null,
    input_preview: PROBE_PROMPT,
    output_preview: text ? text.slice(0, 300) : null,
    error_message: failure ? messageOf(failure).slice(0, 2000) : null,
    user_id: ctx.userId,
    thinking,
  });

  const triedNote = refused.length ? ` Refused: ${refused.join(', ')}.` : '';
  const base = { model, kind: 'chat' as const, latency_ms: latency, model_version: modelVersion, reasoning };
  if (failure) {
    const described = describeProbeFailure(failure);
    return { ...base, ...described, detail: `${described.detail}${triedNote}` };
  }
  if (!/"ok"\s*:\s*true/.test(text ?? '')) {
    return { ...base, status: 'warn', detail: `Answered, but not with the JSON asked for: ${(text ?? '').slice(0, 120) || '(empty)'}` };
  }
  return {
    ...base,
    status: reasoning === 'refused' ? 'warn' : 'ok',
    detail: `${REASONING_DETAIL[reasoning as ThinkingState] ?? 'Answers.'}${triedNote}`,
  };
}

export async function probeEmbedding(client: GoogleGenAI, ctx: ProbeContext): Promise<ModelProbe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  let values: number[] | undefined;
  let failure: unknown;
  try {
    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: 'System check',
      config: { outputDimensionality: 768, abortSignal: controller.signal },
    });
    values = response.embeddings?.[0]?.values;
  } catch (err) {
    failure = err;
  } finally {
    clearTimeout(timer);
  }
  const latency = Date.now() - started;
  await insertGeminiLog(ctx.supabase, {
    endpoint: HEALTH_ENDPOINT,
    model: EMBEDDING_MODEL,
    attempts: 1,
    status: failure ? 'error' : 'success',
    latency_ms: latency,
    input: 'System check (embedding)',
    output: values ? `${values.length} values` : null,
    input_preview: 'System check (embedding)',
    output_preview: values ? `${values.length} values` : null,
    error_message: failure ? messageOf(failure).slice(0, 2000) : null,
    user_id: ctx.userId,
  });
  const base = { model: EMBEDDING_MODEL, kind: 'embedding' as const, latency_ms: latency, model_version: null, reasoning: 'n/a' as const };
  if (failure) return { ...base, ...describeProbeFailure(failure) };
  if (values?.length !== 768) {
    return { ...base, status: 'fail', detail: `Answered with ${values?.length ?? 0} values instead of 768, which recipes.embedding cannot store.` };
  }
  return { ...base, status: 'ok', detail: 'Answers with 768 values, as recipe search needs.' };
}

/** The offered tiers first, then any other id a user has configured. */
export function modelsToProbe(configured: readonly string[] | null | undefined): string[] {
  const extra = [...new Set((configured ?? []).filter((m) => m && !OFFERED_MODELS.includes(m)))].sort();
  return [...OFFERED_MODELS, ...extra];
}

export interface LiveReport {
  checked_at: string;
  services: CheckResult[];
  models: ModelProbe[];
}

export async function runLiveCheck(opts: {
  supabase: SupabaseClient;
  client: GoogleGenAI | null;
  userId: string | null;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<LiveReport> {
  const { supabase, client, userId, env = process.env, fetchImpl } = opts;
  const ctx = { supabase, userId };

  const healthCall = await timed(() => supabase.rpc('system_health'));
  const healthValue = healthCall.value as { data?: SystemHealth | null; error?: unknown } | undefined;
  const healthError = healthCall.error ?? healthValue?.error ?? null;
  const health = healthError ? null : (healthValue?.data ?? null);

  const models = modelsToProbe(health?.configured_models);
  const noKey = (model: string, kind: ModelProbe['kind']): ModelProbe => ({
    model, kind, status: 'skipped', detail: 'No Gemini key is set.', latency_ms: null, model_version: null, reasoning: kind === 'embedding' ? 'n/a' : 'unknown',
  });

  const [database, auth, storage, unsplash, ...probes] = await Promise.all([
    checkDatabase(supabase),
    checkAuth(supabase),
    checkStorage(supabase),
    checkUnsplash(env, fetchImpl),
    ...models.map((m) => (client ? probeModel(client, m, ctx) : Promise.resolve(noKey(m, 'chat')))),
    client ? probeEmbedding(client, ctx) : Promise.resolve(noKey(EMBEDDING_MODEL, 'embedding')),
  ]);

  return {
    checked_at: new Date().toISOString(),
    services: [database, schemaCheck(health, healthError), realtimeCheck(health), auth, storage, unsplash as CheckResult],
    models: probes as ModelProbe[],
  };
}
