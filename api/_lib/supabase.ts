import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Prompts are NOT part of settings — every endpoint uses the templates in
 * prompts.ts. They used to be per-user overrides, which silently pinned users to
 * whatever prompt text was current when they last saved.
 */
export type AiTask = 'extract' | 'tag' | 'nutrition' | 'translate' | 'suggest' | 'scale' | 'shopping';

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
 * Falls back to `gemini_model` for any task the user has not assigned, which is
 * what makes the column safe to add to existing rows: an empty map behaves
 * exactly like the single-model setup it replaced.
 */
export function modelFor(settings: Settings, task: AiTask): string {
  return settings.task_models?.[task] || settings.gemini_model;
}

// An alias Google keeps pointed at the current Flash release. Kept equal to
// DEFAULT_MODEL in src/lib/constants.ts — enforced by modelDefaults.test.ts.
// The concrete model behind it is recorded per call in gemini_logs.model_version.
export const DEFAULT_MODEL = 'gemini-flash-latest';

export function getServerSupabase(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

const SETTINGS_SELECT = 'gemini_model, task_models, temperature_unit';

function rowToSettings(data: Record<string, unknown>, defaults: Settings): Settings {
  return {
    gemini_model: (data.gemini_model as string) || defaults.gemini_model,
    // jsonb comes back as an object; guard against null and against a value that
    // is not an object, since neither should silently become a valid map.
    task_models:
      data.task_models && typeof data.task_models === 'object' && !Array.isArray(data.task_models)
        ? (data.task_models as Partial<Record<AiTask, string>>)
        : {},
    temperature_unit: ((data.temperature_unit as string) as 'C' | 'F') || defaults.temperature_unit,
  };
}

export async function getSettings(supabase: SupabaseClient, userId?: string | null): Promise<Settings> {
  const defaults: Settings = {
    gemini_model: DEFAULT_MODEL,
    task_models: {},
    temperature_unit: 'C',
  };
  try {
    // Prefer the user's own settings row; fall back to the global id=1 row
    if (userId) {
      const { data } = await supabase.from('settings').select(SETTINGS_SELECT).eq('user_id', userId).single();
      if (data) return rowToSettings(data, defaults);
    }
    const { data } = await supabase.from('settings').select(SETTINGS_SELECT).eq('id', 1).single();
    if (!data) return defaults;
    return rowToSettings(data, defaults);
  } catch {
    return defaults;
  }
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
