import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * The notes field used to be labelled "Personal Notes". It never was: the
 * recipes SELECT policy hands the whole row to linked accounts, and the admin
 * recipe view selects '*'. The label now states who can read it.
 *
 * These assert the two facts that copy depends on. If either stops being true —
 * notes become genuinely private, or the admin view narrows its columns — the
 * wording is wrong again and should be revisited rather than left to rot.
 */
const root = process.cwd();

describe('the notes audience claim still holds', () => {
  it('linked accounts receive the whole recipe row, notes included', () => {
    const sql = fs.readFileSync(
      path.join(root, 'supabase/migrations/0049_account_links.sql'),
      'utf8',
    );
    // No column list: the policy governs whole-row visibility.
    expect(sql).toMatch(/create policy "recipes_select"[\s\S]*?linked_user_ids/);
  });

  it('the admin recipe view still selects every column', () => {
    const src = fs.readFileSync(path.join(root, 'api/account.ts'), 'utf8');
    expect(src).toMatch(/from\('recipes'\)\s*\.select\('\*'\)/);
  });

  it('no surface still calls these notes private or personal', () => {
    const ui = fs.readFileSync(path.join(root, 'src/components/RecipeDetail.tsx'), 'utf8');
    // Ignore the explanatory comment, which quotes the old label on purpose.
    const withoutComments = ui.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/Personal Notes/);
    expect(withoutComments).not.toMatch(/private/i);
  });
});
