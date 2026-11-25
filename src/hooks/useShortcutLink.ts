import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';

/**
 * The shared iPhone Shortcuts' iCloud links, on the global settings row:
 * `shortcut_url` for the Photos one (migration 0071), `safari_shortcut_url`
 * for the Safari one (0072) and `link_shortcut_url` for the link one (0073). Everyone reads them, to show "Add to Shortcuts";
 * only the admin can change them, through POST /api/account?action=shortcut-url.
 */
const GLOBAL_SETTINGS_ID = 1;

export type ShortcutKind = 'photos' | 'safari' | 'link';
export type ShortcutLinks = Record<ShortcutKind, string | null>;

const NO_LINKS: ShortcutLinks = { photos: null, safari: null, link: null };

export function useShortcutLink(enabled: boolean) {
  const [urls, setUrls] = useState<ShortcutLinks>(NO_LINKS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<ShortcutKind | null>(null);
  const [error, setError] = useState<{ kind: ShortcutKind; message: string } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // All columns rather than the three by name: in the minutes after a deploy,
    // before its migration has run, naming a new column would fail the whole read.
    void supabase
      .from('settings')
      .select('*')
      .eq('id', GLOBAL_SETTINGS_ID)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const row = (data ?? {}) as { shortcut_url?: string | null; safari_shortcut_url?: string | null; link_shortcut_url?: string | null };
        setUrls({ photos: row.shortcut_url || null, safari: row.safari_shortcut_url || null, link: row.link_shortcut_url || null });
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [enabled]);

  /** Admin only. An empty value removes the link. */
  const save = useCallback(async (kind: ShortcutKind, value: string) => {
    setSaving(kind);
    try {
      const res = await apiFetch('/api/account?action=shortcut-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value.trim(), kind }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      setUrls((prev) => ({ ...prev, [kind]: (body as { url?: string | null }).url || null }));
      setError(null);
      return true;
    } catch (err) {
      setError({ kind, message: err instanceof Error ? err.message : 'The link could not be saved.' });
      return false;
    } finally {
      setSaving(null);
    }
  }, []);

  return { urls, loaded, saving, error, save };
}
