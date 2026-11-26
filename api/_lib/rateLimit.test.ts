import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit, RateLimitUnavailableError } from './rateLimit';

/**
 * The allowance itself is counted in the database (consume_ai_call, migration
 * 0074; its atomicity is covered by supabase/tests/security_review.test.sql).
 * What is tested here is what the server does with the answer — above all
 * that every way of not getting a clear answer refuses the call.
 */
function fakeClient({ rpc, count }: { rpc: { data?: unknown; error?: unknown }; count?: { count?: number | null; error?: unknown } }) {
  const logQuery: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'not']) logQuery[m] = vi.fn(() => logQuery);
  logQuery.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ count: null, error: null, ...count }).then(resolve);
  const client = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null, ...rpc }),
    from: vi.fn(() => logQuery),
  };
  return { client: client as unknown as SupabaseClient, rpc: client.rpc, from: client.from, logQuery };
}

describe('checkRateLimit', () => {
  it('takes a unit from the AI bucket and reports what is left', async () => {
    const { client, rpc } = fakeClient({ rpc: { data: [{ allowed: true, used: 7 }] } });
    await expect(checkRateLimit(client, 'user-1')).resolves.toEqual({ allowed: true, used: 7, limit: 100, remaining: 93 });
    expect(rpc).toHaveBeenCalledWith('consume_ai_call', {
      p_user_id: 'user-1',
      p_bucket: 'ai',
      p_limit: 100,
      p_excluded: ['find-image', 'health-check'],
    });
  });

  it('uses an endpoint\'s own bucket and limit when given one', async () => {
    const { client, rpc } = fakeClient({ rpc: { data: [{ allowed: true, used: 1 }] } });
    await checkRateLimit(client, 'user-1', { endpoint: 'find-image', limit: 500 });
    expect(rpc).toHaveBeenCalledWith('consume_ai_call', expect.objectContaining({ p_bucket: 'find-image', p_limit: 500 }));
  });

  it('refuses when the database says the allowance is used up', async () => {
    const { client } = fakeClient({ rpc: { data: [{ allowed: false, used: 100 }] } });
    await expect(checkRateLimit(client, 'user-1')).resolves.toMatchObject({ allowed: false, remaining: 0 });
  });

  it('refuses when counting fails, instead of letting the call through', async () => {
    const { client, from } = fakeClient({ rpc: { error: { code: '57014', message: 'canceling statement due to statement timeout' } } });
    await expect(checkRateLimit(client, 'user-1')).rejects.toBeInstanceOf(RateLimitUnavailableError);
    expect(from).not.toHaveBeenCalled();
  });

  it('refuses an answer it cannot read', async () => {
    const { client } = fakeClient({ rpc: { data: [] } });
    await expect(checkRateLimit(client, 'user-1')).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it('counts the log while the function does not exist yet (the minutes after a deploy)', async () => {
    const { client, logQuery } = fakeClient({
      rpc: { error: { code: 'PGRST202', message: 'Could not find the function public.consume_ai_call' } },
      count: { count: 100 },
    });
    await expect(checkRateLimit(client, 'user-1')).resolves.toMatchObject({ allowed: false, used: 100 });
    expect(logQuery.not).toHaveBeenCalledWith('endpoint', 'in', '(find-image,health-check)');
  });

  it('and refuses if that count fails too', async () => {
    const { client } = fakeClient({
      rpc: { error: { code: 'PGRST202', message: 'Could not find the function public.consume_ai_call' } },
      count: { count: null, error: { message: 'boom' } },
    });
    await expect(checkRateLimit(client, 'user-1')).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });
});
