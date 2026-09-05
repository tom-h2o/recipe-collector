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

  it('is an auto-updating alias, so releases do not need a code change', () => {
    expect(CLIENT_DEFAULT).toMatch(/^gemini-/);
    expect(CLIENT_DEFAULT).toMatch(/-latest$/);
  });
});

/**
 * Aliases are only defensible because we can always tell what actually ran.
 *
 * gemini-flash-latest re-points to a new release whenever Google promotes one.
 * Without recording the response's modelVersion, a change in extraction quality
 * would be untraceable — no log row would say which model produced it. Dropping
 * that logging would quietly turn the alias into the liability it isn't today,
 * and nothing else in the suite would notice, hence this test.
 */
describe('alias resolution is recorded', () => {
  const geminiSource = fs.readFileSync(
    path.resolve(process.cwd(), 'api/_lib/gemini.ts'),
    'utf8',
  );

  it('reads modelVersion off the generateContent response', () => {
    expect(geminiSource).toMatch(/response\.modelVersion/);
  });

  it('writes it to the gemini_logs row alongside the requested model', () => {
    expect(geminiSource).toMatch(/model_version:/);
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
