import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';

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

export async function getSettings(supabase: SupabaseClient): Promise<Settings> {
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
    const { data } = await supabase
      .from('settings')
      .select('gemini_model, gemini_prompt, gemini_prompt_tag, gemini_prompt_nutrition, gemini_prompt_translate, gemini_prompt_suggest, gemini_prompt_shopping, temperature_unit')
      .eq('id', 1)
      .single();
    if (!data) return defaults;
    return {
      gemini_model: data.gemini_model || defaults.gemini_model,
      gemini_prompt: data.gemini_prompt || defaults.gemini_prompt,
      gemini_prompt_tag: data.gemini_prompt_tag || defaults.gemini_prompt_tag,
      gemini_prompt_nutrition: data.gemini_prompt_nutrition || defaults.gemini_prompt_nutrition,
      gemini_prompt_translate: data.gemini_prompt_translate || defaults.gemini_prompt_translate,
      gemini_prompt_suggest: data.gemini_prompt_suggest || defaults.gemini_prompt_suggest,
      gemini_prompt_shopping: data.gemini_prompt_shopping || defaults.gemini_prompt_shopping,
      temperature_unit: (data.temperature_unit as 'C' | 'F') || defaults.temperature_unit,
    };
  } catch {
    return defaults;
  }
}

export async function getUserId(req: VercelRequest): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const { data: { user } } = await getServerSupabase().auth.getUser(token);
  return user?.id ?? null;
}

export function resolveApiKey(_settings: Settings): string {
  return process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || '';
}
