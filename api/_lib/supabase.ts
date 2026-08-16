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
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const { data: { user } } = await getServerSupabase().auth.getUser(token);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolveApiKey(_settings: Settings): string {
  return process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || '';
}
