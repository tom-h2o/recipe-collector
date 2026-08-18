import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Prompts are NOT part of settings — every endpoint uses the templates in
 * prompts.ts. They used to be per-user overrides, which silently pinned users to
 * whatever prompt text was current when they last saved.
 */
export interface Settings {
  gemini_model: string;
  temperature_unit: 'C' | 'F';
}

const DEFAULT_MODEL = 'gemini-2.5-flash'; // keep in sync with DEFAULT_MODEL in src/lib/constants.ts

export function getServerSupabase(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

const SETTINGS_SELECT = 'gemini_model, temperature_unit';

function rowToSettings(data: Record<string, unknown>, defaults: Settings): Settings {
  return {
    gemini_model: (data.gemini_model as string) || defaults.gemini_model,
    temperature_unit: ((data.temperature_unit as string) as 'C' | 'F') || defaults.temperature_unit,
  };
}

export async function getSettings(supabase: SupabaseClient, userId?: string | null): Promise<Settings> {
  const defaults: Settings = {
    gemini_model: DEFAULT_MODEL,
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
