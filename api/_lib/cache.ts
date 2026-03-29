import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Build a deterministic cache key from the endpoint name and its normalised input.
 * Arrays are sorted before hashing so order doesn't affect the key.
 */
export function makeCacheKey(endpoint: string, input: unknown): string {
  const normalised = Array.isArray(input)
    ? JSON.stringify([...input].sort())
    : JSON.stringify(input);
  return createHash('sha256').update(`${endpoint}:${normalised}`).digest('hex');
}

/** Return cached result if still valid, otherwise null. */
export async function getCached<T>(
  supabase: SupabaseClient,
  key: string,
): Promise<T | null> {
  const { data } = await supabase
    .from('ai_cache')
    .select('result')
    .eq('cache_key', key)
    .gt('expires_at', new Date().toISOString())
    .single();
  return data ? (data.result as T) : null;
}

/** Persist a result to the cache (fire-and-forget). */
export function setCached(
  supabase: SupabaseClient,
  key: string,
  endpoint: string,
  result: unknown,
  ttlHours: number,
): void {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  supabase
    .from('ai_cache')
    .upsert({ cache_key: key, endpoint, result, expires_at: expiresAt })
    .then(() => {}, () => {});
}
