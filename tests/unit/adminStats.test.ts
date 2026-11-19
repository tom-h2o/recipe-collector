import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getStats } from '../../api/account';

/**
 * The admin overview's model chart.
 *
 * It was built by selecting `model, model_version` from every gemini_logs row
 * and counting in JavaScript. The API caps a response at 1000 rows without
 * saying so (`max_rows`), so past a thousand logged calls the chart was a count
 * of an arbitrary thousand. It is now grouped in the database by
 * `gemini_model_usage()` (migration 0066); the grouping itself is covered by
 * pgTAP in supabase/tests/rls.test.sql, against a real Postgres.
 */

type Result = { data?: unknown; error?: unknown; count?: number };

function makeSupabase(usage: Result) {
  const head = { count: 7, error: null };
  // Every count query here is `select('*', { count, head })`, optionally `.gte()`.
  const countQuery = Object.assign(Promise.resolve(head), { gte: () => Promise.resolve(head) });
  const select = vi.fn(() => countQuery);
  const rpc = vi.fn(() => Promise.resolve(usage));
  return {
    client: {
      auth: { admin: { listUsers: () => Promise.resolve({ data: { users: [], total: 2 }, error: null }) } },
      from: vi.fn(() => ({ select })),
      rpc,
    } as never,
    rpc,
    select,
  };
}

describe('admin model usage', () => {
  it('takes the breakdown from the database function', async () => {
    const { client, rpc } = makeSupabase({
      // bigint may arrive as a string
      data: [{ model: 'gemini-4-hydrogen-001', call_count: '2502' }, { model: 'gemini-flash-latest', call_count: 3 }],
      error: null,
    });

    const stats = await getStats(client);

    expect(rpc).toHaveBeenCalledWith('gemini_model_usage');
    expect(stats.model_breakdown).toEqual([
      { model: 'gemini-4-hydrogen-001', count: 2502 },
      { model: 'gemini-flash-latest', count: 3 },
    ]);
  });

  it('never downloads log rows to count them', async () => {
    const { client, select } = makeSupabase({ data: [], error: null });
    await getStats(client);
    // Head-only counts and nothing else: no query that returns rows.
    for (const call of select.mock.calls as unknown as [string, { head?: boolean }?][]) {
      expect(call[1]).toMatchObject({ head: true });
    }
  });

  it('loses the chart, not the page, when the function is unavailable', async () => {
    // The state of things for a few minutes after a deploy: Vercel publishes
    // the new code at once, the migration job creates the function later.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = makeSupabase({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.gemini_model_usage' } });

    const stats = await getStats(client);

    expect(stats.model_breakdown).toEqual([]);
    expect(stats.total_ai_calls).toBe(7);
    expect(stats.total_users).toBe(2);
  });

  it('is granted to the service key alone', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0066_gemini_model_usage.sql'), 'utf8');
    // Supabase grants EXECUTE to anon and authenticated by default privilege,
    // so revoking from PUBLIC alone would leave both able to call it.
    expect(sql).toMatch(/revoke all on function public\.gemini_model_usage\(\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.gemini_model_usage\(\) to service_role;/);
    expect(sql).toMatch(/set search_path = ''/);
  });
});
