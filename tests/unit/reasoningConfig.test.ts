import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { REASONING_OFF_TASKS, thinkingFor, OFFERED_MODELS } from '../../api/_lib/supabase';
import { AI_TASKS, MODELS } from '../../src/lib/constants';

/**
 * Whether a task reasons is decided in one place, REASONING_OFF_TASKS, and the
 * admin System tab displays that list. It is only true to what runs if every
 * endpoint takes its value from there: an endpoint passing `thinking: false`
 * by hand would run one way while the panel said another.
 */
describe('reasoning per task', () => {
  it('is off exactly for translation, tagging and nutrition', () => {
    expect([...REASONING_OFF_TASKS].sort()).toEqual(['nutrition', 'tag', 'translate']);
    for (const { task } of AI_TASKS) {
      expect(thinkingFor(task)).toBe(!REASONING_OFF_TASKS.includes(task));
    }
  });

  const apiDir = path.resolve(process.cwd(), 'api');
  // The endpoints, plus _lib/enrich.ts, where tagging and nutrition run for
  // both their endpoints and the iPhone Shortcut import.
  const endpoints = [
    ...fs.readdirSync(apiDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')),
    '_lib/enrich.ts',
  ]
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(apiDir, f), 'utf8') }))
    .filter(({ src }) => src.includes('generateJson('));

  it('finds the AI endpoints (guards the scan itself)', () => {
    expect(endpoints.map((e) => e.file).sort()).toEqual(
      ['_lib/enrich.ts', 'extract.ts', 'scale.ts', 'shopping.ts', 'suggest.ts', 'translate.ts'],
    );
  });

  for (const { file, src } of endpoints) {
    it(`${file} takes reasoning from thinkingFor, for the task it runs as`, () => {
      expect(src, 'a hard-coded thinking value').not.toMatch(/thinking:\s*(true|false)/);
      const calls = src.split('generateJson(').length - 1;
      const reasoned = [...src.matchAll(/thinking:\s*thinkingFor\('([a-z]+)'\)/g)].map((m) => m[1]);
      expect(reasoned.length, 'every generateJson call passes thinking').toBe(calls);
      const tasks = new Set([...src.matchAll(/modelFor\(settings, '([a-z]+)'\)/g)].map((m) => m[1]));
      for (const task of reasoned) expect(tasks.has(task), `${task} is not the task this endpoint's model is for`).toBe(true);
    });
  }
});

describe('the models the System tab probes', () => {
  it('are the ones offered in Settings', () => {
    expect([...OFFERED_MODELS]).toEqual(MODELS);
  });
});
