import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { modelFor, type Settings } from '../../api/_lib/supabase';
import { AI_TASKS } from '../../src/lib/constants';

const base: Settings = { gemini_model: 'main-model', task_models: {}, temperature_unit: 'C' };

describe('modelFor', () => {
  it('falls back to the main model for a task with no override', () => {
    expect(modelFor(base, 'tag')).toBe('main-model');
  });

  it('uses the override when one is set', () => {
    expect(modelFor({ ...base, task_models: { tag: 'lite-model' } }, 'tag')).toBe('lite-model');
  });

  it('leaves other tasks on the main model when one task is overridden', () => {
    const s = { ...base, task_models: { tag: 'lite-model' } };
    expect(modelFor(s, 'extract')).toBe('main-model');
  });

  it('treats an empty string as no override rather than an empty model id', () => {
    // An empty id would be sent to Gemini verbatim and 404. The UI stores "same
    // as main" by deleting the key, but a hand-edited row can still contain "".
    expect(modelFor({ ...base, task_models: { tag: '' } }, 'tag')).toBe('main-model');
  });

  it('survives a row whose task_models is missing entirely', () => {
    // Rows written before migration 0052 have no such column.
    const legacy = { gemini_model: 'main-model', temperature_unit: 'C' } as unknown as Settings;
    expect(modelFor(legacy, 'nutrition')).toBe('main-model');
  });
});

/**
 * The client renders one row per task and the server resolves per task. If the
 * two lists drift, a task shown in Settings silently has no effect, or one that
 * runs has no way to be configured.
 */
describe('the task list is the same on both sides', () => {
  it('matches between constants.ts and api/_lib/supabase.ts', () => {
    const serverSource = fs.readFileSync(
      path.resolve(process.cwd(), 'api/_lib/supabase.ts'),
      'utf8',
    );
    const declared = serverSource.match(/export type AiTask =([^;]+);/)?.[1] ?? '';
    const serverTasks = [...declared.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
    expect(serverTasks).toEqual(AI_TASKS.map((t) => t.task).sort());
  });
});

/**
 * Every AI endpoint must resolve through modelFor. Reaching for
 * settings.gemini_model directly still *works* — it just quietly ignores the
 * user's per-task choice, which is the kind of bug nothing else would catch.
 */
describe('no endpoint bypasses per-task resolution', () => {
  const apiDir = path.resolve(process.cwd(), 'api');
  const endpoints = fs
    .readdirSync(apiDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  for (const file of endpoints) {
    it(`${file} does not read settings.gemini_model directly`, () => {
      const src = fs.readFileSync(path.join(apiDir, file), 'utf8');
      expect(src).not.toMatch(/settings\.gemini_model/);
    });
  }
});
