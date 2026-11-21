import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Prompts are NOT part of settings — every endpoint uses the templates in
 * prompts.ts. They used to be per-user overrides, which silently pinned users to
 * whatever prompt text was current when they last saved.
 */
export type AiTask = 'extract' | 'tag' | 'nutrition' | 'translate' | 'suggest' | 'scale' | 'shopping';

/** The same list as a value, for code that walks every task (the System tab). */
export const AI_TASK_IDS: readonly AiTask[] = ['extract', 'tag', 'nutrition', 'translate', 'suggest', 'scale', 'shopping'];

export interface Settings {
  /** Model for any task without its own entry in `task_models`. */
  gemini_model: string;
  /** Sparse per-task overrides; a missing task falls back to `gemini_model`. */
  task_models: Partial<Record<AiTask, string>>;
  temperature_unit: 'C' | 'F';
}

/**
 * The model a given task should run on.
 *
 * Falls back to `gemini_model` for any task the admin has not assigned, which is
 * what makes the column safe to add to existing rows: an empty map behaves
 * exactly like the single-model setup it replaced.
 */
export function modelFor(settings: Settings, task: AiTask): string {
  return settings.task_models?.[task] || settings.gemini_model;
}

/**
 * The tasks that run with reasoning switched off. The one place this is
 * decided: every endpoint passes `thinking: thinkingFor(task)` to
 * generateJson, and the admin System tab shows this same list, so what it
 * says cannot drift from what runs. tests/unit/reasoningConfig.test.ts fails
 * an endpoint that hard-codes the value instead.
 *
 * Off where the work is rewriting or classifying text the app already has;
 * each endpoint says why at its call. A model may refuse "off" — some only
 * run in thinking mode — and generateJson then runs it with reasoning on and
 * records `thinking = 'refused'` on that call's gemini_logs row.
 */
export const REASONING_OFF_TASKS: readonly AiTask[] = ['translate', 'tag', 'nutrition'];

export function thinkingFor(task: AiTask): boolean {
  return !REASONING_OFF_TASKS.includes(task);
}

/**
 * The model ids the admin can choose from in Settings, in tier order. A copy of the ids in
 * MODEL_OPTIONS (src/lib/constants.ts), because src and api do not import from
 * each other; tests/unit/reasoningConfig.test.ts asserts the two match. The
 * System tab probes every one of these, whether or not anyone has chosen it.
 */
export const OFFERED_MODELS: readonly string[] = ['gemini-3.5-flash-lite', 'gemini-4-hydrogen', 'gemini-4-carbon'];

// An alias Google keeps pointed at the current Flash release. Kept equal to
// DEFAULT_MODEL in src/lib/constants.ts — enforced by modelDefaults.test.ts.
// The concrete model behind it is recorded per call in gemini_logs.model_version.
export const DEFAULT_MODEL = 'gemini-4-hydrogen';

export function getServerSupabase(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

/**
 * The settings row that holds the AI models for everyone. Models are chosen by
 * the admin (POST /api/account?action=models), never per person: since
 * migration 0068 a user's own row contributes only temperature_unit, and any
 * gemini_model or task_models left on it is ignored.
 */
export const GLOBAL_SETTINGS_ID = 1;

const MODEL_SELECT = 'gemini_model, task_models';

function isTaskMap(value: unknown): value is Partial<Record<AiTask, string>> {
  // jsonb comes back as an object; guard against null and against a value that
  // is not an object, since neither should silently become a valid map.
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asUnit(value: unknown): 'C' | 'F' | null {
  return value === 'C' || value === 'F' ? value : null;
}

/**
 * What an AI call needs to know: the models (the global row) and the caller's
 * temperature unit (their own row). The two reads are independent, so one
 * failing leaves the other's answer intact; anything missing falls back to the
 * code defaults, which is also what the app shows when the row is absent.
 */
export async function getSettings(supabase: SupabaseClient, userId?: string | null): Promise<Settings> {
  const defaults: Settings = {
    gemini_model: DEFAULT_MODEL,
    task_models: {},
    temperature_unit: 'C',
  };
  const read = async (q: () => PromiseLike<{ data: Record<string, unknown> | null }>) => {
    try {
      return (await q()).data ?? null;
    } catch {
      return null;
    }
  };
  const [models, own] = await Promise.all([
    read(() => supabase.from('settings').select(MODEL_SELECT).eq('id', GLOBAL_SETTINGS_ID).single()),
    userId
      ? read(() => supabase.from('settings').select('temperature_unit').eq('user_id', userId).single())
      : Promise.resolve(null),
  ]);
  return {
    gemini_model: (models?.gemini_model as string) || defaults.gemini_model,
    task_models: isTaskMap(models?.task_models) ? models.task_models : {},
    temperature_unit: asUnit(own?.temperature_unit) ?? defaults.temperature_unit,
  };
}

/** The admin's model choice, as written to the global row. */
export interface ModelConfig {
  gemini_model: string;
  task_models: Partial<Record<AiTask, string>>;
}

/**
 * Writes the models everyone's AI calls run on. Service key only: RLS keeps
 * every user off the global row (settings_update, migration 0020), which is
 * what makes this admin-only rather than a matter of hiding a control.
 * The caller has already checked the ids against OFFERED_MODELS.
 */
export async function saveModelConfig(supabase: SupabaseClient, config: ModelConfig): Promise<ModelConfig> {
  const { data, error } = await supabase
    .from('settings')
    .upsert(
      { id: GLOBAL_SETTINGS_ID, user_id: null, gemini_model: config.gemini_model, task_models: config.task_models },
      { onConflict: 'id' },
    )
    .select(MODEL_SELECT)
    .single();
  if (error) throw error;
  return {
    gemini_model: (data?.gemini_model as string) || config.gemini_model,
    task_models: isTaskMap(data?.task_models) ? data.task_models : config.task_models,
  };
}

export async function getUserId(authHeader: string | undefined): Promise<string | null> {
  const user = await getAuthenticatedUser(authHeader);
  return user?.id ?? null;
}

export async function getAuthenticatedUser(authHeader: string | undefined): Promise<{ id: string; email: string | null } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const { data: { user } } = await getServerSupabase().auth.getUser(token);
    return user ? { id: user.id, email: user.email ?? null } : null;
  } catch {
    return null;
  }
}

export async function userOwnsRecipe(supabase: SupabaseClient, recipeId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id')
    .eq('id', recipeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

/**
 * Every user whose recipes the given user may read: themselves, plus anyone
 * they have an accepted account link with.
 *
 * The API uses the service key, which bypasses RLS entirely, so endpoints that
 * filter by user_id must widen the set themselves. Missing this does not error —
 * it quietly returns only the caller's own recipes while the rest of the app
 * shows both.
 */
export async function getVisibleUserIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('account_links')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (error || !data) return [userId];

    const linked = data
      .map((l) => (l.requester_id === userId ? l.addressee_id : l.requester_id))
      .filter((id): id is string => !!id);

    return [...new Set([userId, ...linked])];
  } catch {
    // Failing closed is the safe direction: the caller sees only their own
    // recipes rather than risking a wider set from a half-answered query.
    return [userId];
  }
}

/**
 * True when the user may *read* this recipe: their own, or one belonging to an
 * account they are linked with.
 *
 * Distinct from userOwnsRecipe, which answers "may they change it". Translation
 * is a read: `recipes_select` (migration 0049) lets a linked account open the
 * recipe, and RecipeDetail offers the language picker on it, so gating that on
 * ownership returned 403 for every linked recipe someone tried to translate.
 */
export async function userCanReadRecipe(supabase: SupabaseClient, recipeId: string, userId: string): Promise<boolean> {
  const visibleIds = await getVisibleUserIds(supabase, userId);
  const { data, error } = await supabase
    .from('recipes')
    .select('id')
    .eq('id', recipeId)
    .in('user_id', visibleIds)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

/**
 * The admin may act on recipes they do not own (view, edit, re-run tagging or
 * nutrition from the admin panel), so ownership checks accept an admin as well.
 */
export async function isAdminUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const adminEmail = process.env.VITE_ADMIN_EMAIL ?? '';
  if (!adminEmail) return false;
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return false;
  return data.user.email === adminEmail;
}

/** True when the user owns the recipe, or is the admin acting on someone else's. */
export async function canEditRecipe(supabase: SupabaseClient, recipeId: string, userId: string): Promise<boolean> {
  if (await userOwnsRecipe(supabase, recipeId, userId)) return true;
  return isAdminUser(supabase, userId);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolveApiKey(_settings: Settings): string {
  return process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || '';
}
