import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { msg, t, translateMessage } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { DEFAULT_MODEL } from '@/lib/constants';
import type { AppSettings } from '@/types';

/**
 * The settings row that holds the AI models for everyone (GLOBAL_SETTINGS_ID in
 * api/_lib/supabase.ts). Models are the admin's choice, not a preference:
 * every user reads them from here (RLS settings_select allows it, nothing lets
 * a user write it), and only the admin can change them, through
 * POST /api/account?action=models. A user's own row holds temperature_unit only.
 */
const GLOBAL_SETTINGS_ID = 1;

function sameModels(a: AppSettings, b: AppSettings): boolean {
  return a.gemini_model === b.gemini_model
    && JSON.stringify(a.task_models ?? {}) === JSON.stringify(b.task_models ?? {});
}

export function useSettings(userId?: string | null) {
  const [settings, setSettings] = useState<AppSettings>({
    gemini_model: DEFAULT_MODEL,
    task_models: {},
    temperature_unit: 'C',
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  // What is saved now, for telling whether a save changes the models.
  const current = useRef(settings);
  useEffect(() => { current.current = settings; }, [settings]);

  const fetchSettings = useCallback(async () => {
    if (!userId) return; // No user — keep code defaults, API uses server-side settings

    const [own, global] = await Promise.all([
      supabase.from('settings').select('temperature_unit').eq('user_id', userId).single(),
      supabase.from('settings').select('gemini_model, task_models').eq('id', GLOBAL_SETTINGS_ID).single(),
    ]);
    const unit = own.data?.temperature_unit;
    const models = global.data;

    // Either may be missing (no row yet, or a read that failed); each falls
    // back to the code default on its own, which is also what the server does.
    setSettings({
      gemini_model: models?.gemini_model || DEFAULT_MODEL,
      // jsonb arrives as an object; anything else is treated as "no overrides"
      // rather than trusted, so a bad value cannot break every AI call.
      task_models:
        models?.task_models && typeof models.task_models === 'object' && !Array.isArray(models.task_models)
          ? models.task_models
          : {},
      temperature_unit: unit === 'C' || unit === 'F' ? unit : 'C',
    });
  }, [userId]);

  /**
   * Saves the temperature unit to the user's own row and, when the models
   * differ from what is saved, sends them to the admin endpoint. The server
   * refuses that for anyone but the admin; Settings only offers the controls
   * to the admin, so for everyone else the models never differ.
   */
  const saveSettings = useCallback(
    async (updated: AppSettings) => {
      setIsSavingSettings(true);
      try {
        if (!userId) {
          toast.error(t('You must be signed in to save settings.'));
          return;
        }

        const { error } = await supabase
          .from('settings')
          .upsert({ user_id: userId, temperature_unit: updated.temperature_unit }, { onConflict: 'user_id' });
        if (error) {
          toast.error(t('Failed to save settings: {message}', { message: translateMessage(error.message) }));
          return;
        }

        const before = current.current;
        if (!sameModels(updated, before)) {
          let message: string | null = null;
          try {
            const res = await apiFetch('/api/account?action=models', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gemini_model: updated.gemini_model, task_models: updated.task_models ?? {} }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              message = (body as { error?: string }).error || `HTTP ${res.status}`;
            }
          } catch (err) {
            message = err instanceof Error ? err.message : msg('Network error');
          }
          if (message) {
            // The unit was saved; the models were not, so keep showing the old ones.
            setSettings({ ...before, temperature_unit: updated.temperature_unit });
            toast.error(t('Failed to save the AI models: {message}', { message: translateMessage(message) }));
            return;
          }
        }

        setSettings(updated);
        toast.success(t('Settings saved!'));
      } finally {
        setIsSavingSettings(false);
      }
    },
    [userId],
  );

  return { settings, isSavingSettings, fetchSettings, saveSettings };
}
