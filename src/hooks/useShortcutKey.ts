import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { msg } from '@/i18n';

/**
 * The person's key for the iPhone Shortcut (api/account.ts, shortcut-key
 * routes). The key itself is returned once, when it is made, and kept only in
 * this hook's state until Settings closes; the server stores a hash.
 */
export interface ShortcutKeyStatus {
  hasKey: boolean;
  created_at: string | null;
  last_used_at: string | null;
}

export function useShortcutKey(enabled: boolean) {
  const [status, setStatus] = useState<ShortcutKeyStatus | null>(null);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/account?tab=shortcut-key');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
      setError(null);
    } catch {
      setError(msg('Could not check the Shortcut key.'));
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const create = useCallback(async () => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/account?action=shortcut-key', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.key !== 'string') throw new Error(body.error || `HTTP ${res.status}`);
      setFreshKey(body.key);
      setStatus({ hasKey: true, created_at: body.created_at ?? new Date().toISOString(), last_used_at: null });
      setError(null);
    } catch {
      setError(msg('The key could not be made. Please try again.'));
    } finally {
      setBusy(false);
    }
  }, []);

  const revoke = useCallback(async () => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/account?action=shortcut-key-revoke', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFreshKey(null);
      setStatus({ hasKey: false, created_at: null, last_used_at: null });
      setError(null);
    } catch {
      setError(msg('The key could not be removed. Please try again.'));
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, freshKey, busy, error, create, revoke };
}
