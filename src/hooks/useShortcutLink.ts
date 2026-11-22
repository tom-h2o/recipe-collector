import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';

/**
 * The shared iPhone Shortcut's iCloud link (settings.shortcut_url on the
 * global row, migration 0071). Everyone reads it, to show "Add to Shortcuts";
 * only the admin can change it, through POST /api/account?action=shortcut-url.
 */
const GLOBAL_SETTINGS_ID = 1;

export function useShortcutLink(enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void supabase
      .from('settings')
      .select('shortcut_url')
      .eq('id', GLOBAL_SETTINGS_ID)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const value = (data as { shortcut_url?: string | null } | null)?.shortcut_url;
        setUrl(value || null);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [enabled]);

  /** Admin only. An empty value removes the link. */
  const save = useCallback(async (value: string) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/account?action=shortcut-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      setUrl((body as { url?: string | null }).url || null);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The link could not be saved.');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { url, loaded, saving, error, save };
}
