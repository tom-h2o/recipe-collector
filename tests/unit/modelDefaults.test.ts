import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { DEFAULT_MODEL as CLIENT_DEFAULT } from '../../src/lib/constants';
import { DEFAULT_MODEL as SERVER_DEFAULT } from '../../api/_lib/supabase';

/**
 * The frontend seeds settings with its own default while the API falls back to
 * its own. If the two drift, a user with no saved settings row sees one model
 * in the UI while a different one does the work.
 *
 * Lives here rather than under src/ because api/_lib/supabase.ts uses `process`,
 * which is not typed in the browser-facing tsconfig.
 */
describe('default Gemini model', () => {
  it('is identical on the client and the server', () => {
    expect(SERVER_DEFAULT).toBe(CLIENT_DEFAULT);
  });

  it('is a concrete pinned id, not an auto-updating alias', () => {
    expect(CLIENT_DEFAULT).toMatch(/^gemini-\d/);
    expect(CLIENT_DEFAULT).not.toMatch(/-latest$/);
  });
});

/**
 * Policy: when DEFAULT_MODEL changes, every user moves with it.
 *
 * That only happens if a migration syncs the settings rows, and a constant can
 * be edited without anyone remembering to write one. This asserts the newest
 * migration that sets gemini_model targets the current default, so changing the
 * constant alone fails the build.
 */
describe('all users follow the default model', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  /** The model named by the most recent migration that assigns gemini_model. */
  function latestSyncedModel(): { file: string; model: string } | null {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of [...files].reverse()) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const match = [...sql.matchAll(/set\s+gemini_model\s*=\s*'([^']+)'/gi)].pop();
      if (match) return { file, model: match[1] };
    }
    return null;
  }

  it('has a migration moving existing rows onto the current default', () => {
    const latest = latestSyncedModel();
    expect(latest, 'no migration assigns gemini_model at all').not.toBeNull();
    expect(
      latest!.model,
      `DEFAULT_MODEL is "${CLIENT_DEFAULT}" but the newest sync migration (${latest!.file}) ` +
        `sets "${latest!.model}". Add a migration updating public.settings so existing users move too.`,
    ).toBe(CLIENT_DEFAULT);
  });
});
