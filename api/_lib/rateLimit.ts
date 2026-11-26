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

/**
 * The allowance could not be checked. The call is refused rather than let
 * through: an allowance that opens whenever counting fails is no limit.
 * Worded for the person, so describeGeminiError passes it on as it is.
 */
export class RateLimitUnavailableError extends Error {
  constructor() {
    super('Your daily AI allowance could not be checked just now. Please try again in a minute.');
    this.name = 'RateLimitUnavailableError';
  }
}

/** PostgREST's "no such function" (PGRST202) and Postgres's own (42883). */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883' || /consume_ai_call/.test(error.message ?? '');
}

/**
 * Takes one call from today's allowance, or says it is used up.
 *
 * Despite the name this does not only check: an `allowed` answer has already
 * taken a unit, so call it right before the AI call it pays for, after any
 * cache lookup (a cached answer costs nothing) and after the request has been
 * validated.
 *
 * It used to count today's gemini_logs rows, which are written only once the
 * answer is in — up to two minutes later — so parallel requests all saw the
 * same count and all went through, and a failed count let everything through.
 * consume_ai_call (migration 0074) counts and takes in one statement under a
 * row lock. If that function is not there yet (the minutes after a deploy,
 * before the migration job has run) the old count from the log is used, once
 * more failing closed.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  { endpoint, limit = DAILY_LIMIT }: Options = {},
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc('consume_ai_call', {
    p_user_id: userId,
    p_bucket: endpoint ?? 'ai',
    p_limit: limit,
    p_excluded: [...NON_AI_ENDPOINTS],
  });

  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; used?: number | string } | null;
    if (!row || typeof row.allowed !== 'boolean') throw new RateLimitUnavailableError();
    const used = Number(row.used ?? limit);
    return { allowed: row.allowed, used, limit, remaining: Math.max(0, limit - used) };
  }

  if (!isMissingFunction(error)) {
    console.error('consume_ai_call failed:', error);
    throw new RateLimitUnavailableError();
  }
  return countFromLog(supabase, userId, endpoint, limit);
}

/** The count before migration 0074: today's log rows. Not atomic, but closed on failure. */
async function countFromLog(supabase: SupabaseClient, userId: string, endpoint: string | undefined, limit: number): Promise<RateLimitResult> {
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
    // The AI allowance counts AI calls only; find-image is logged here too
    // but is an Unsplash lookup with its own budget.
    query = query.not('endpoint', 'in', `(${NON_AI_ENDPOINTS.join(',')})`);
  }

  const { count, error } = await query;
  if (error || typeof count !== 'number') throw new RateLimitUnavailableError();

  const remaining = Math.max(0, limit - count);
  return { allowed: count < limit, used: count, limit, remaining };
}
