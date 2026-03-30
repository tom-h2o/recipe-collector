import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Settings {
  gemini_model: string;
  gemini_prompt: string;
  active_api_key: number;
  temperature_unit: 'C' | 'F';
}

const DEFAULT_MODEL = 'gemini-2.5-flash';

export function getServerSupabase(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function getSettings(supabase: SupabaseClient): Promise<Settings> {
  const defaults: Settings = {
    gemini_model: DEFAULT_MODEL,
    gemini_prompt: '',
    active_api_key: 1,
    temperature_unit: 'C',
  };
  try {
    const { data } = await supabase
      .from('settings')
      .select('gemini_model, gemini_prompt, active_api_key, temperature_unit')
      .eq('id', 1)
      .single();
    if (!data) return defaults;
    return {
      gemini_model: data.gemini_model || defaults.gemini_model,
      gemini_prompt: data.gemini_prompt || defaults.gemini_prompt,
      active_api_key: data.active_api_key ?? defaults.active_api_key,
      temperature_unit: (data.temperature_unit as 'C' | 'F') || defaults.temperature_unit,
    };
  } catch {
    return defaults;
  }
}

export function resolveApiKey(settings: Settings): string {
  if (settings.active_api_key === 2) {
    return process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || '';
  }
  return process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || '';
}
