import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { DEFAULT_PROMPT } from '@/lib/constants';
import type { AppSettings } from '@/types';

export function useSettings(userId?: string | null) {
  const [settings, setSettings] = useState<AppSettings>({
    gemini_model: 'gemini-2.5-flash',
    gemini_prompt: DEFAULT_PROMPT,
    active_api_key: 1,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fetchSettings = useCallback(async () => {
    // Try per-user settings first, fall back to legacy global row (id=1)
    const query = supabase
      .from('settings')
      .select('gemini_model, gemini_prompt, active_api_key');

    const { data } = userId
      ? await query.eq('user_id', userId).single()
      : await query.eq('id', 1).single();

    if (data) {
      setSettings({
        gemini_model: data.gemini_model || 'gemini-2.5-flash',
        gemini_prompt: data.gemini_prompt || DEFAULT_PROMPT,
        active_api_key: (data.active_api_key as 1 | 2) || 1,
      });
    }
  }, [userId]);

  const saveSettings = useCallback(
    async (updated: AppSettings) => {
      setIsSavingSettings(true);
      const payload = userId
        ? { user_id: userId, gemini_model: updated.gemini_model, gemini_prompt: updated.gemini_prompt, active_api_key: updated.active_api_key }
        : { id: 1, gemini_model: updated.gemini_model, gemini_prompt: updated.gemini_prompt, active_api_key: updated.active_api_key };

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
