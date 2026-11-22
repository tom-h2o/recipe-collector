import { describe, expect, it } from 'vitest';
import { AVAILABLE_TAGS as SHARED, TAG_GROUPS, groupOfTag } from '../../shared/tags';
import { AVAILABLE_TAGS as SERVER, TAG_TEMPLATE } from '../../api/_lib/prompts';
import { tagResponseSchema } from '../../api/_lib/responseSchemas';

/**
 * One tag list, read by both sides: the AI is shown it and can answer only
 * with it, and the app filters and edits with it. There used to be two
 * hand-kept copies with nothing holding them equal.
 */
describe('the tag list', () => {
  it('is the same list on the server as in shared/tags.ts', () => {
    expect(SERVER).toBe(SHARED);
  });

  it('is what the AI is shown, and all it can answer with', () => {
    for (const tag of SHARED) expect(TAG_TEMPLATE).toContain(tag);
    expect((tagResponseSchema.items as { enum?: string[] }).enum).toEqual([...SHARED]);
  });

  it('puts every tag in exactly one group', () => {
    const all = TAG_GROUPS.flatMap((g) => g.tags as readonly string[]);
    expect(new Set(all).size).toBe(all.length);
    for (const tag of SHARED) expect(groupOfTag(tag)).toBeDefined();
  });

  it('has no tag that would break a PostgREST array filter', () => {
    // recipeStore filters with .contains('tags', [...]), which writes
    // cs.{a,b} without quoting: a comma, brace, quote or backslash in a tag
    // would split it or end the list. Spaces, "&" and parentheses are fine.
    for (const tag of SHARED) expect(tag, tag).not.toMatch(/[,{}"\\]/);
  });
});
