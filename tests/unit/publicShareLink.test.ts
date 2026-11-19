import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const migration = readFileSync(join(MIGRATIONS, '0061_public_recipe_links.sql'), 'utf8');

/** The RETURNS TABLE(...) list of get_shared_recipe. */
function returnedColumns(): string[] {
  const m = migration.match(/returns table \(([\s\S]*?)\)\s*language sql/i);
  if (!m) throw new Error('get_shared_recipe no longer declares a RETURNS TABLE list');
  return m[1]
    .split(',')
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

describe('public share links (migration 0061)', () => {
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
    //
    // The share entries sit inside the owner-only block of the options menu,
    // after a separator. What matters is that the `!isLinked` gate is still
    // open when `shareUrl ?` is reached: nothing between the two may close it
    // (`)}`), however the menu around them is laid out.
    expect(detail).toMatch(/\{!isLinked && \(\s*<>(?:(?!\)\})[\s\S])*?\{shareUrl \?/);
  });
});

describe('guest routes follow the device theme', () => {
  const app = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8');

  it('mounts ThemeSync on all three screens that render neither Layout nor AuthGate', () => {
    // useDarkMode is what puts `dark` on <html>, and it is called only from
    // Layout and AuthGate. The share page, the dead-link page and /about
    // render neither, so without ThemeSync every `dark:` class on them is
    // dead and they stay light on a device set to dark.
    expect((app.match(/<ThemeSync \/>/g) ?? []).length).toBe(3);
  });

  it('keeps the public pages off the vault queries', () => {
    // A guest has no vault; the query returns nothing under RLS and is a
    // wasted round trip on every share view.
    expect(app).toMatch(/if \(isPublicSharePath \|\| isAboutPath\) return;/);
  });
});

describe('the gallery and translation RPCs (migration 0063)', () => {
  const m = readFileSync(join(MIGRATIONS, '0063_shared_recipe_extras.sql'), 'utf8');

  it.each(['get_shared_recipe_images', 'get_shared_recipe_translations'])(
    '%s is security definer, pinned, and reachable by anon',
    (fn) => {
      expect(m).toMatch(new RegExp(`create or replace function public\\.${fn}\\(p_token uuid\\)`, 'i'));
      expect(m).toMatch(new RegExp(`grant execute on function public\\.${fn}\\(uuid\\) to anon`, 'i'));
    },
  );

  it('pins the search_path on both functions', () => {
    expect((m.match(/set search_path = ''/g) ?? []).length).toBe(2);
  });

  it('guards both against a null token', () => {
    expect((m.match(/p_token is not null/g) ?? []).length).toBe(2);
  });

  it('reaches the rows only through the shared recipe', () => {
    // Joining on recipes.public_share_token is what scopes these to one
    // recipe; without it a token would expose every image in the table.
    expect((m.match(/r\.public_share_token = p_token/g) ?? []).length).toBe(2);
  });

  it('never exposes who owns the photos', () => {
    const returns = m.match(/returns table \(([\s\S]*?)\)\s*language sql/g) ?? [];
    expect(returns.length).toBe(2);
    for (const block of returns) {
      expect(block).not.toMatch(/user_id/);
    }
  });
});

describe('the guest page', () => {
  const page = readFileSync(join(ROOT, 'src', 'components', 'PublicRecipe.tsx'), 'utf8');

  it('names a guest’s saved PDF after the recipe', () => {
    // Browsers take the filename from document.title, so without this the
    // export is named after the tab — and the tab is the app's name.
    expect(page).toMatch(/usePrintTitle\(/);
  });

  it('never reaches an AI endpoint', () => {
    // Every /api route requires a Bearer token and is rate limited per user.
    // A guest may read a translation that exists; they must not be able to
    // cause one to be made.
    expect(page).not.toMatch(/apiFetch|\/api\//);
  });

  it('reads only through the share RPCs', () => {
    const tables = page.match(/\.from\(['"][a-z_]+['"]\)/g) ?? [];
    expect(tables).toEqual([]);
  });
});

describe('finding your shared recipes again', () => {
  const store = readFileSync(join(ROOT, 'src', 'store', 'recipeStore.ts'), 'utf8');
  const constants = readFileSync(join(ROOT, 'src', 'lib', 'constants.ts'), 'utf8');

  it('offers a filter chip for them', () => {
    expect(constants).toMatch(/Shared/);
  });

  it('filters on the token server-side, like every other chip', () => {
    // Client-side filtering would break the paginated query: the page size is
    // applied in the database, so a post-filter returns short pages.
    expect(store).toMatch(/not\('public_share_token', 'is', null\)/);
  });

  it('runs one copy of the filter logic, not two', () => {
    // fetchRecipes and loadMore each had their own copy. A chip added to one
    // and not the other filters the first page, then loads an unfiltered
    // second page when the reader scrolls.
    expect((store.match(/applyTagFilter\(query,/g) ?? []).length).toBe(2);
    expect((store.match(/function applyTagFilter/g) ?? []).length).toBe(1);
    // The chip names appear once each, inside that one function.
    expect((store.match(/Favourites'/g) ?? []).length).toBe(1);
  });
});
