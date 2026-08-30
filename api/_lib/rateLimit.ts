import type { SupabaseClient } from '@supabase/supabase-js';
import { DAILY_LIMIT, NON_AI_ENDPOINTS } from '../../shared/usage.js';

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

interface Options {
  /**
   * Count only calls to this endpoint, against its own allowance. Used by
   * non-Gemini endpoints so they cannot eat the AI budget: an Unsplash cover
   * lookup should never be the reason a recipe extraction is refused.
   */
  endpoint?: string;
  limit?: number;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  { endpoint, limit = DAILY_LIMIT }: Options = {},
): Promise<RateLimitResult> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let query = supabase
    .from('gemini_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', todayStart.toISOString());

  if (endpoint) {
    query = query.eq('endpoint', endpoint);
  } else {
    // The AI allowance counts Gemini calls only; find-image is logged here too
    // but is an Unsplash lookup with its own budget.
    query = query.not('endpoint', 'in', `(${NON_AI_ENDPOINTS.join(',')})`);
  }

  const { count } = await query;

  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);
  return { allowed: used < limit, used, limit, remaining };
}
