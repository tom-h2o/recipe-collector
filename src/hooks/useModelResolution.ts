import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface ModelResolution {
  /** The id configured in Settings, e.g. gemini-flash-lite-latest. */
  model: string;
  /** The concrete model Google actually ran, from the response's modelVersion. */
  servedBy: string;
  /** When that last happened. */
  at: string;
}

/**
 * What each configured model id has actually been resolving to.
 *
 * An alias hides which model is really doing the work, and Google moves them
 * without telling anyone: gemini-flash-latest went from 3.7 to 3.8 silently,
 * then stayed on the 3.x tier when Gemini 4 shipped under new names. The only
 * trustworthy answer comes from calls that really happened, which is why
 * generateJson records modelVersion on every log row.
 *
 * Reads the viewer's own rows — RLS allows exactly that — so this reports what
 * *their* calls resolved to rather than someone else's.
 */
export function useModelResolution(userId?: string | null) {
  const [resolutions, setResolutions] = useState<ModelResolution[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchResolutions = useCallback(async () => {
    if (!userId) { setResolutions([]); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('gemini_logs')
        .select('model, model_version, created_at')
        .eq('user_id', userId)
        .not('model_version', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      // Newest first, so the first row seen for an id is its latest resolution.
      const latest = new Map<string, ModelResolution>();
      for (const row of (data ?? []) as { model: string; model_version: string; created_at: string }[]) {
        if (!row.model || !row.model_version) continue;
        if (!latest.has(row.model)) {
          latest.set(row.model, { model: row.model, servedBy: row.model_version, at: row.created_at });
        }
      }
      setResolutions([...latest.values()]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void fetchResolutions(); }, [fetchResolutions]);

  /** The resolution for one configured id, or null when it has never run. */
  const resolutionFor = useCallback(
    (model: string) => resolutions.find((r) => r.model === model) ?? null,
    [resolutions],
  );

  return { resolutions, resolutionFor, loading, refresh: fetchResolutions };
}
