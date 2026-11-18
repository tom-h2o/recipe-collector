import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const migration = readFileSync(join(MIGRATIONS, '0056_public_recipe_links.sql'), 'utf8');

/** The RETURNS TABLE(...) list of get_shared_recipe. */
function returnedColumns(): string[] {
  const m = migration.match(/returns table \(([\s\S]*?)\)\s*language sql/i);
  if (!m) throw new Error('get_shared_recipe no longer declares a RETURNS TABLE list');
  return m[1]
    .split(',')
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

describe('public share links (migration 0056)', () => {
  // Why this file exists: a public page is the one place where adding a column
  // to `recipes` can leak something. `select *` would have shipped the owner's
  // private notes to anyone holding a link, so the RPC names its columns and
  // this test fails the moment a private one is added to that list.
  it.each(['notes', 'user_id', 'rating', 'embedding', 'search_vector', 'preferred_language', 'is_favourite'])(
    'never exposes %s to an anonymous reader',
    (column) => {
      expect(returnedColumns()).not.toContain(column);
    }
  );

  it('still returns what the share page actually renders', () => {
    const cols = returnedColumns();
    for (const needed of ['id', 'title', 'ingredients', 'instructions', 'servings', 'original_servings']) {
      expect(cols).toContain(needed);
    }
  });

  it('reads through a security definer function with a pinned search_path', () => {
    // security definer is what lets an anonymous caller read one row without
    // any grant on the table; an unpinned search_path would make that function
    // hijackable by anything that can create a schema.
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = ''/i);
  });

  it('grants anon execute on the function and nothing else', () => {
    expect(migration).toMatch(/grant execute on function public\.get_shared_recipe\(uuid\) to anon/i);
  });

  it('keeps the token unique so one token means one recipe', () => {
    expect(migration).toMatch(/create unique index[\s\S]*public_share_token/i);
  });

  it('guards against a null token matching any row', () => {
    // Revoking sets the token back to null. If a null argument matched null
    // rows, revoking a single recipe would publish every unshared one.
    expect(migration).toMatch(/p_token is not null/i);
  });

  it('no migration ever grants anon a direct read of recipes', () => {
    // The whole design rests on anon having no table access. A policy `to anon`
    // on recipes would make the token decorative.
    const offenders: string[] = [];
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
      const policies = sql.match(/create policy[\s\S]*?;/gi) ?? [];
      for (const policy of policies) {
        if (/on public\.recipes/i.test(policy) && /\bto\b[^;]*\banon\b/i.test(policy)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the share link the UI hands out', () => {
  const detail = readFileSync(join(ROOT, 'src', 'components', 'RecipeDetail.tsx'), 'utf8');

  it('points at the token route, not the recipe id', () => {
    // The old button copied /recipe/{id}, which an anonymous visitor could not
    // read once 0040/0049 narrowed recipes_select — it showed them a login
    // screen while the toast said "Link copied!".
    expect(detail).toMatch(/\/r\/\$\{(shareToken|token)\}/);
    expect(detail).not.toMatch(/\/recipe\/\$\{recipe\.id\}/);
  });

  it('stores the token before copying the link', () => {
    // Copy-then-save would hand out a URL that does not work yet, or at all if
    // the write is refused.
    const create = detail.match(/async function handleCreateShareLink\(\)[\s\S]*?\n {2}\}/);
    expect(create).toBeTruthy();
    const body = create![0];
    expect(body.indexOf('onUpdateRecipe')).toBeLessThan(body.indexOf('copyToClipboard'));
    expect(body).toMatch(/if \(!saved\) return;/);
  });

  it('offers sharing only on recipes the viewer owns', () => {
    // RLS refuses the token write on a linked account's recipe, so the control
    // must not be offered there (the mistake ratings and notes once made).
    expect(detail).toMatch(/\{!isLinked && \(\s*\n\s*shareUrl \?/);
  });
});
