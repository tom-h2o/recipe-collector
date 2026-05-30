import type { SupabaseClient } from '@supabase/supabase-js';
import type { Context } from 'hono';

export const DAILY_LIMIT = 100;

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

export async function checkRateLimit(supabase: SupabaseClient, userId: string): Promise<RateLimitResult> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('gemini_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', todayStart.toISOString());

  const used = count ?? 0;
  const remaining = Math.max(0, DAILY_LIMIT - used);
  return { allowed: used < DAILY_LIMIT, used, limit: DAILY_LIMIT, remaining };
}

export function rateLimitResponse(c: Context, result: RateLimitResult) {
  return c.json(
    { error: `Daily AI call limit reached (${result.limit} calls/day). Resets at midnight UTC.` },
    429,
  );
}
