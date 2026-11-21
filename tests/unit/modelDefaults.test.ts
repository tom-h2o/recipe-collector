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

  it('is a Gemini model id that has been verified against generateContent', () => {
    // No longer required to be a -latest alias. Aliases track releases inside a
    // tier but not across a generation: Google left gemini-flash-latest on the
    // 3.x Flash tier when it shipped Gemini 4 under new names. What actually
    // matters is that the id serves generateContent — ListModels advertises both
    // retired models and models a free-tier key cannot call.
    expect(CLIENT_DEFAULT).toMatch(/^gemini-/);
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
 * Policy: when DEFAULT_MODEL changes, what runs moves with it. Since 0068 that
 * is the global settings row (id = 1) alone; the admin chooses for everyone.
 *
 * That only happens if a migration updates that row, and a constant can
 * be edited without anyone remembering to write one. This asserts the newest
 * migration that sets gemini_model targets the current default, so changing the
 * constant alone fails the build.
 */
describe('all users follow the default model', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  /** The model named by the most recent migration that assigns gemini_model. */
  /**
   * Every migration statement that assigns gemini_model, newest file first.
   *
   * A `where` clause does not distinguish a default change from a repair —
   * 0055 moves everyone to the default *except* those who deliberately chose
   * Lite or Frontier, so it has one too. What separates them is the value: a
   * default change assigns DEFAULT_MODEL, anything else is a targeted fix
   * (0065 moves users off a Lite id the API never served).
   */
  function modelAssignments(): { file: string; model: string; scoped: boolean }[] {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort().reverse();
    const out: { file: string; model: string; scoped: boolean }[] = [];
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      for (const m of sql.matchAll(/set\s+gemini_model\s*=\s*'([^']+)'([\s\S]*?);/gi)) {
        out.push({ file, model: m[1], scoped: /\bwhere\b/i.test(m[2] ?? '') });
      }
    }
    return out;
  }

  it('has a migration moving existing rows onto the current default', () => {
    const assignments = modelAssignments();
    expect(assignments.length, 'no migration assigns gemini_model at all').toBeGreaterThan(0);
    expect(
      assignments.map((a) => a.model),
      `DEFAULT_MODEL is "${CLIENT_DEFAULT}" but no migration sets it. Add one ` +
        'updating public.settings so existing users move too.',
    ).toContain(CLIENT_DEFAULT);
  });

  it('never moves every user onto something that is not the default', () => {
    // A repair may move the users it names onto another model; it must say who
    // through a `where` clause. An unconditional assignment to anything but
    // DEFAULT_MODEL would silently override the default for everyone.
    const unscopedNonDefault = modelAssignments()
      .filter((a) => !a.scoped && a.model !== CLIENT_DEFAULT);
    expect(
      unscopedNonDefault,
      'these assign a non-default model to every row with no where clause',
    ).toEqual([]);
  });
});
