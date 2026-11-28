import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AVAILABLE_TAGS as SHARED, TAG_GROUPS, groupOfTag } from '../../shared/tags';
import { AVAILABLE_TAGS as SERVER, TAG_TEMPLATE } from '../../api/_lib/prompts';
import { tagListSchema } from '../../api/_lib/responseSchemas';

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
    expect((tagListSchema.items as { enum?: string[] }).enum).toEqual([...SHARED]);
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

  it('is searchable by every tag\'s German name (migration 0080)', () => {
    // Tags are stored in English. The database adds each tag's German name to
    // the text the vault searches, from a list in the migration; the names
    // the app shows are in src/i18n/de. A tag renamed there, or a new tag,
    // must reach that list or "vegetarisch" stops finding Vegetarian.
    const root = join(__dirname, '..', '..');
    const german = new Map<string, string>();
    for (const file of readdirSync(join(root, 'src/i18n/de'))) {
      const text = readFileSync(join(root, 'src/i18n/de', file), 'utf8');
      for (const m of text.matchAll(/^\s*'([^'\n]+)':\s*'([^'\n]+)',?\s*$/gm)) german.set(m[1], m[2]);
    }
    const dir = join(root, 'supabase/migrations');
    const newest = readdirSync(dir).filter((f) => readFileSync(join(dir, f), 'utf8').includes('function public.tag_search_words')).sort().pop()!;
    const sql = readFileSync(join(dir, newest), 'utf8');
    const listed = new Map<string, string>();
    for (const m of sql.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)) listed.set(m[1], m[2].toLowerCase());

    const missing: string[] = [];
    for (const tag of SHARED) {
      const name = german.get(tag);
      if (!name || name.toLowerCase() === tag.toLowerCase()) continue; // same word in both languages
      const words = name.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length > 2);
      const entry = listed.get(tag) ?? '';
      if (!words.every((w) => entry.includes(w))) missing.push(`${tag} → ${name}`);
    }
    expect(missing).toEqual([]);
    for (const tag of listed.keys()) expect(SHARED).toContain(tag);
  });
});
