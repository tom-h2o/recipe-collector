import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES } from '../../src/lib/constants';

const ROOT = join(__dirname, '..', '..');

/**
 * The offered languages are declared in three places that must agree: the
 * picker (LANGUAGES), what the API will accept (translateSchema) and the names
 * the prompt uses (LANGUAGE_NAMES). A language present in one but not another
 * fails at a different layer each time — the picker offers it and the API
 * rejects it, or the API accepts it and the prompt asks for a language called
 * "pl".
 */
const schemas = readFileSync(join(ROOT, 'api', '_lib', 'schemas.ts'), 'utf8');
const translate = readFileSync(join(ROOT, 'api', 'translate.ts'), 'utf8');

function schemaLanguages(): string[] {
  const m = schemas.match(/targetLanguage: z\.enum\(\[([^\]]*)\]/);
  if (!m) throw new Error('translateSchema no longer declares targetLanguage as an enum');
  return [...m[1].matchAll(/'([a-z]{2})'/g)].map((x) => x[1]);
}

function promptLanguages(): string[] {
  const m = translate.match(/const LANGUAGE_NAMES[^=]*= \{([^}]*)\}/);
  if (!m) throw new Error('LANGUAGE_NAMES is no longer a literal object');
  return [...m[1].matchAll(/(\w{2}):/g)].map((x) => x[1]);
}

describe('offered languages', () => {
  it('the picker, the API schema and the prompt names all agree', () => {
    const picker = LANGUAGES.map((l) => l.code).sort();
    expect(schemaLanguages().sort()).toEqual(picker);
    expect(promptLanguages().sort()).toEqual(picker);
  });

  it('does not offer Polish', () => {
    // Removed deliberately. Migration 0062 cleared the cached Polish
    // translations and reset any recipe left displaying in it.
    expect(LANGUAGES.map((l) => l.code)).not.toContain('pl');
    expect(schemaLanguages()).not.toContain('pl');
    expect(promptLanguages()).not.toContain('pl');
  });

  it('still reads Polish durations out of recipe text', () => {
    // Not a contradiction: recipes written in Polish are still in the vault
    // (original_language survives 0062), and their steps still say "25 minut".
    // Dropping this would quietly remove cook-mode timers from those recipes.
    const durations = readFileSync(join(ROOT, 'src', 'lib', 'parseDurations.ts'), 'utf8');
    expect(durations).toMatch(/minut/);
  });

  it('has a migration that clears the Polish data rather than stranding it', () => {
    const files = readdirSync(join(ROOT, 'supabase', 'migrations'));
    const file = files.find((f) => /remove_polish/.test(f));
    expect(file).toBeTruthy();
    const sql = readFileSync(join(ROOT, 'supabase', 'migrations', file!), 'utf8');
    expect(sql).toMatch(/delete from public\.recipe_translations/i);
    expect(sql).toMatch(/set preferred_language = null/i);
    // original_language records what the recipe actually is; it is not a setting.
    expect(sql).not.toMatch(/set original_language/i);
  });

  it('names each language the same way in the interface and in the prompt', () => {
    // LANGUAGES carries two names: `label`, the language's own ("Deutsch"),
    // for the picker, and `name`, the English one ("German"), for English
    // sentences such as "Delete German translation". The prompt has its own
    // English names in LANGUAGE_NAMES; the two must not drift apart.
    const m = translate.match(/const LANGUAGE_NAMES[^=]*= \{([^}]*)\}/);
    const promptNames = Object.fromEntries(
      [...m![1].matchAll(/(\w{2}):\s*'([^']+)'/g)].map((x) => [x[1], x[2]]),
    );
    for (const lang of LANGUAGES) {
      expect(promptNames[lang.code], `English name for ${lang.code}`).toBe(lang.name);
    }
  });

  it('never puts a language\u2019s own name into an English sentence', () => {
    // "Delete Deutsch translation" was the fault. The picker chips may show
    // `label`; anything built into English wording must use `name`.
    const detail = readFileSync(join(ROOT, 'src', 'components', 'RecipeDetail.tsx'), 'utf8');
    expect(detail).not.toMatch(/(Delete|Translate to|translation deleted|delete the) \$\{[^}]*\.label\}/);
    expect(detail).toMatch(/\.name \?\? code\.toUpperCase\(\)/);
  });
});

