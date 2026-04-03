import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { DEFAULT_PROMPT } from '@/lib/constants';
import type { AppSettings } from '@/types';

export function useSettings(userId?: string | null) {
  const [settings, setSettings] = useState<AppSettings>({
    gemini_model: 'gemini-2.5-flash',
    gemini_prompt: DEFAULT_PROMPT,
    gemini_prompt_tag: '',
    gemini_prompt_nutrition: '',
    gemini_prompt_translate: '',
    gemini_prompt_suggest: '',
    gemini_prompt_shopping: '',
    active_api_key: 1,
    temperature_unit: 'C',
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!userId) return; // No user — keep code defaults, API uses server-side settings

    const { data } = await supabase
      .from('settings')
      .select('gemini_model, gemini_prompt, gemini_prompt_tag, gemini_prompt_nutrition, gemini_prompt_translate, gemini_prompt_suggest, gemini_prompt_shopping, active_api_key, temperature_unit')
      .eq('user_id', userId)
      .single();

    if (data) {
      setSettings({
        gemini_model: data.gemini_model || 'gemini-2.5-flash',
        gemini_prompt: data.gemini_prompt || DEFAULT_PROMPT,
        gemini_prompt_tag: data.gemini_prompt_tag || '',
        gemini_prompt_nutrition: data.gemini_prompt_nutrition || '',
        gemini_prompt_translate: data.gemini_prompt_translate || '',
        gemini_prompt_suggest: data.gemini_prompt_suggest || '',
        gemini_prompt_shopping: data.gemini_prompt_shopping || '',
        active_api_key: (data.active_api_key as 1 | 2) || 1,
        temperature_unit: (data.temperature_unit as 'C' | 'F') || 'C',
      });
    }
    // If no row exists yet, state stays at code defaults — saved on first explicit save
  }, [userId]);

  const saveSettings = useCallback(
    async (updated: AppSettings) => {
      setIsSavingSettings(true);
      if (!userId) {
        toast.error('You must be signed in to save settings.');
        setIsSavingSettings(false);
        return;
      }
      const payload = {
        id: 1,
        user_id: userId,
        gemini_model: updated.gemini_model,
        gemini_prompt: updated.gemini_prompt,
        gemini_prompt_tag: updated.gemini_prompt_tag,
        gemini_prompt_nutrition: updated.gemini_prompt_nutrition,
        gemini_prompt_translate: updated.gemini_prompt_translate,
        gemini_prompt_suggest: updated.gemini_prompt_suggest,
        gemini_prompt_shopping: updated.gemini_prompt_shopping,
        active_api_key: updated.active_api_key,
        temperature_unit: updated.temperature_unit,
      };

      const { error } = await supabase.from('settings').upsert(payload);
      if (!error) {
        setSettings(updated);
        toast.success('Settings saved!');
      } else {
        toast.error('Failed to save settings: ' + error.message);
      }
      setIsSavingSettings(false);
    },
    [userId],
  );

  return { settings, isSavingSettings, fetchSettings, saveSettings };
}
