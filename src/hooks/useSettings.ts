import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { DEFAULT_MODEL } from '@/lib/constants';
import type { AppSettings } from '@/types';

export function useSettings(userId?: string | null) {
  const [settings, setSettings] = useState<AppSettings>({
    gemini_model: DEFAULT_MODEL,
    task_models: {},
    temperature_unit: 'C',
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!userId) return; // No user — keep code defaults, API uses server-side settings

    const { data } = await supabase
      .from('settings')
      .select('gemini_model, task_models, temperature_unit')
      .eq('user_id', userId)
      .single();

    if (data) {
      setSettings({
        gemini_model: data.gemini_model || DEFAULT_MODEL,
        // jsonb arrives as an object; anything else is treated as "no overrides"
        // rather than trusted, so a bad value cannot break every AI call.
        task_models:
          data.task_models && typeof data.task_models === 'object' && !Array.isArray(data.task_models)
            ? data.task_models
            : {},
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
        user_id: userId,
        gemini_model: updated.gemini_model,
        task_models: updated.task_models ?? {},
        temperature_unit: updated.temperature_unit,
      };

      const { error } = await supabase.from('settings').upsert(payload, { onConflict: 'user_id' });
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
