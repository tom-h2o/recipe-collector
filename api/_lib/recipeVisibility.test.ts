import { describe, expect, it, vi } from 'vitest';
import { userCanReadRecipe } from './supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The set of recipes a user may read is "their own, plus any account they are
 * linked with". The API uses the service key, which bypasses RLS entirely, so
 * this has to be enforced in code — and getting it wrong is silent in both
 * directions: too narrow and a linked recipe 403s, too wide and someone reads
 * a stranger's.
 */
function mockSupabase({ links, matchingRecipe }: {
  links: { requester_id: string; addressee_id: string }[];
  matchingRecipe: boolean;
}) {
  const inCall = vi.fn();
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'account_links') {
        return {
          select: () => ({
            eq: () => ({
              or: vi.fn().mockResolvedValue({ data: links, error: null }),
            }),
          }),
        };
      }
      // recipes
      return {
        select: () => ({
          eq: () => ({
            in: (column: string, ids: string[]) => {
              inCall(column, ids);
              return { maybeSingle: vi.fn().mockResolvedValue({ data: matchingRecipe ? { id: 'r1' } : null, error: null }) };
            },
          }),
        }),
      };
    }),
  };
  return { supabase: supabase as unknown as SupabaseClient, inCall };
}

describe('userCanReadRecipe', () => {
  it('looks for the recipe among the viewer and everyone they are linked with', async () => {
    const { supabase, inCall } = mockSupabase({
      links: [{ requester_id: 'me', addressee_id: 'partner' }],
      matchingRecipe: true,
    });

    await expect(userCanReadRecipe(supabase, 'r1', 'me')).resolves.toBe(true);
    const [column, ids] = inCall.mock.calls[0];
    expect(column).toBe('user_id');
    expect([...ids].sort()).toEqual(['me', 'partner']);
  });

  it('resolves the link from either side', async () => {
    // The viewer may be the addressee rather than the requester.
    const { supabase, inCall } = mockSupabase({
      links: [{ requester_id: 'partner', addressee_id: 'me' }],
      matchingRecipe: true,
    });

    await userCanReadRecipe(supabase, 'r1', 'me');
    expect([...inCall.mock.calls[0][1]].sort()).toEqual(['me', 'partner']);
  });

  it('falls back to the viewer alone when there are no links', async () => {
    const { supabase, inCall } = mockSupabase({ links: [], matchingRecipe: true });

    await userCanReadRecipe(supabase, 'r1', 'me');
    expect(inCall.mock.calls[0][1]).toEqual(['me']);
  });

  it('says no when the recipe belongs to nobody the viewer is linked with', async () => {
    const { supabase } = mockSupabase({ links: [], matchingRecipe: false });
    await expect(userCanReadRecipe(supabase, 'someone-elses', 'me')).resolves.toBe(false);
  });
});
