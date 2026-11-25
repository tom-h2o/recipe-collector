import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * What the iPhone Shortcuts sent and the person has not looked at yet: the
 * recipe_imports rows (migration 0070) with no seen_at. Drives the "new
 * recipes from your iPhone" banner and the New badge on cards.
 *
 * Read with the person's own session; RLS shows only their rows and lets them
 * set seen_at and nothing else. A failed read (e.g. in the minutes after a
 * deploy, before the migration has run) shows nothing rather than an error.
 */
export interface RecipeImport {
  id: string;
  status: 'processing' | 'saved' | 'failed';
  recipe_id: string | null;
  error: string | null;
  page_count: number;
  /** Where it came from: pictures from Photos, a page from Safari (0072), or a link from any app (0073). Absent before 0072 ran. */
  source?: 'photos' | 'page' | 'link';
  created_at: string;
}

/** How often to look again while something is still being read. */
export const IMPORT_POLL_MS = 15_000;

export function useRecipeImports(userId: string | null | undefined, onSaved?: () => void) {
  const [imports, setImports] = useState<RecipeImport[]>([]);
  const previous = useRef<RecipeImport[]>([]);
  const onSavedRef = useRef(onSaved);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  const fetchImports = useCallback(async () => {
    if (!userId) { setImports([]); return; }
    const { data, error } = await supabase
      .from('recipe_imports')
      // All columns: naming `source` would fail the read before 0072 has run.
      .select('*')
      .is('seen_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data) return;
    const next = data as RecipeImport[];
    // Something finished being read since the last look: the vault needs it.
    const wasProcessing = new Set(previous.current.filter((i) => i.status === 'processing').map((i) => i.id));
    if (next.some((i) => i.status === 'saved' && wasProcessing.has(i.id))) onSavedRef.current?.();
    previous.current = next;
    setImports(next);
  }, [userId]);

  // On sign-in, and whenever the app comes back to the front: a recipe sent
  // from the Photos app arrives while this one is in the background.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchImports();
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchImports(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchImports]);

  const processing = imports.filter((i) => i.status === 'processing');
  useEffect(() => {
    if (processing.length === 0) return;
    const timer = setInterval(() => { void fetchImports(); }, IMPORT_POLL_MS);
    return () => clearInterval(timer);
  }, [processing.length, fetchImports]);

  const saved = useMemo(() => imports.filter((i) => i.status === 'saved' && i.recipe_id), [imports]);
  const failed = useMemo(() => imports.filter((i) => i.status === 'failed'), [imports]);
  const newRecipeIds = useMemo(() => new Set(saved.map((i) => i.recipe_id as string)), [saved]);

  /** Opening a recipe counts as having seen it. */
  const markSeen = useCallback(async (recipeId: string) => {
    if (!imports.some((i) => i.recipe_id === recipeId)) return;
    setImports((list) => list.filter((i) => i.recipe_id !== recipeId));
    previous.current = previous.current.filter((i) => i.recipe_id !== recipeId);
    await supabase.from('recipe_imports').update({ seen_at: new Date().toISOString() }).eq('recipe_id', recipeId).is('seen_at', null);
  }, [imports]);

  /** Closes a failure notice. */
  const dismiss = useCallback(async (importId: string) => {
    setImports((list) => list.filter((i) => i.id !== importId));
    previous.current = previous.current.filter((i) => i.id !== importId);
    await supabase.from('recipe_imports').update({ seen_at: new Date().toISOString() }).eq('id', importId);
  }, []);

  return { imports, processing, saved, failed, newRecipeIds, markSeen, dismiss, refresh: fetchImports };
}
