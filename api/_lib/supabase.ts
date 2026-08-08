import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Settings {
  gemini_model: string;
  gemini_prompt: string;
  gemini_prompt_tag: string;
  gemini_prompt_nutrition: string;
  gemini_prompt_translate: string;
  gemini_prompt_suggest: string;
  gemini_prompt_shopping: string;
  temperature_unit: 'C' | 'F';
}

const DEFAULT_MODEL = 'gemini-2.5-flash'; // keep in sync with DEFAULT_MODEL in src/lib/constants.ts

export function getServerSupabase(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

const SETTINGS_SELECT = 'gemini_model, gemini_prompt, gemini_prompt_tag, gemini_prompt_nutrition, gemini_prompt_translate, gemini_prompt_suggest, gemini_prompt_shopping, temperature_unit';

function rowToSettings(data: Record<string, unknown>, defaults: Settings): Settings {
  return {
    gemini_model: (data.gemini_model as string) || defaults.gemini_model,
    gemini_prompt: (data.gemini_prompt as string) || defaults.gemini_prompt,
    gemini_prompt_tag: (data.gemini_prompt_tag as string) || defaults.gemini_prompt_tag,
    gemini_prompt_nutrition: (data.gemini_prompt_nutrition as string) || defaults.gemini_prompt_nutrition,
    gemini_prompt_translate: (data.gemini_prompt_translate as string) || defaults.gemini_prompt_translate,
    gemini_prompt_suggest: (data.gemini_prompt_suggest as string) || defaults.gemini_prompt_suggest,
    gemini_prompt_shopping: (data.gemini_prompt_shopping as string) || defaults.gemini_prompt_shopping,
    temperature_unit: ((data.temperature_unit as string) as 'C' | 'F') || defaults.temperature_unit,
  };
}

export async function getSettings(supabase: SupabaseClient, userId?: string | null): Promise<Settings> {
  const defaults: Settings = {
    gemini_model: DEFAULT_MODEL,
    gemini_prompt: '',
    gemini_prompt_tag: '',
    gemini_prompt_nutrition: '',
    gemini_prompt_translate: '',
    gemini_prompt_suggest: '',
    gemini_prompt_shopping: '',
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolveApiKey(_settings: Settings): string {
  return process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || '';
}
