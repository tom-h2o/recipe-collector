import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const cssPath = path.resolve(process.cwd(), 'src/index.css');
const css = fs.readFileSync(cssPath, 'utf8');

/**
 * Guards the colour-token contract between tailwind.config.js and index.css.
 *
 * The config wraps every token as `oklch(var(--x) / <alpha-value>)` or
 * `rgb(var(--x) / <alpha-value>)`, so the CSS variables must hold BARE channel
 * values. When they held full `oklch(...)` colours instead, every utility
 * compiled to `oklch(oklch(...))` — invalid CSS that silently resolved to
 * transparent, which is what made dark mode render as a black void.
 *
 * Tailwind is compiled against the real config here, so the tokens checked are
 * exactly the ones the app's own utilities reference.
 */

/** Custom properties declared in a given selector block of index.css. */
function tokensIn(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n  \\}`));
  if (!block) throw new Error(`Could not find the "${selector}" block in index.css`);
  const out: Record<string, string> = {};
  for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

const light = tokensIn(':root');
const dark = tokensIn('.dark');

let compiled = '';
let referenced: { name: string; wrapper: string }[] = [];

beforeAll(async () => {
  const result = await postcss([
    tailwindcss({ config: './tailwind.config.js' }),
  ]).process(css, { from: cssPath });
  compiled = result.css;

  // Every token the app's compiled utilities actually reference.
  const seen = new Map<string, string>();
  const withoutComments = compiled.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, wrapper, name] of withoutComments.matchAll(/(oklch|rgb)\(var\((--[\w-]+)\)/g)) {
    seen.set(name, wrapper);
  }
  referenced = [...seen].map(([name, wrapper]) => ({ name, wrapper }));
}, 60000);

describe('theme colour tokens', () => {
  it('finds the tokens the app references (guards the parser itself)', () => {
    expect(referenced.length).toBeGreaterThan(15);
    expect(Object.keys(light).length).toBeGreaterThan(15);
    expect(Object.keys(dark).length).toBeGreaterThan(15);
  });

  it('defines every referenced token in :root', () => {
    const missing = referenced.filter(({ name }) => light[name] === undefined).map(({ name }) => name);
    expect(missing, 'used by a Tailwind utility but missing from :root').toEqual([]);
  });

  it('defines every referenced token in .dark', () => {
    // A token defined only in :root keeps its light value in dark mode, which is
    // how the sk-* palette used to render dark text on dark surfaces.
    const missing = referenced.filter(({ name }) => dark[name] === undefined).map(({ name }) => name);
    expect(missing, 'missing from .dark, so dark mode inherits the light value').toEqual([]);
  });

  it('stores bare channels, never a wrapped colour', () => {
    const wrapped: string[] = [];
    for (const { name, wrapper } of referenced) {
      for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
        const value = tokens[name];
        if (value && /^(oklch|rgb|rgba|hsl|hsla|color)\(|^#/.test(value)) {
          wrapped.push(`${name} (${theme}) = "${value}" but the config already wraps it in ${wrapper}()`);
        }
      }
    }
    expect(wrapped, 'these compile to a doubly-wrapped colour, which is invalid CSS').toEqual([]);
  });

  it('forms a syntactically valid colour once substituted', () => {
    const invalid: string[] = [];
    for (const { name, wrapper } of referenced) {
      for (const tokens of [light, dark]) {
        const value = tokens[name];
        if (!value) continue;
        const substituted = `${wrapper}(${value} / 1)`;
        if (!/^(oklch|rgb)\(\s*[\d.]+%?\s+[\d.]+%?\s+[\d.]+%?\s*\/\s*1\)$/.test(substituted)) {
          invalid.push(`${name}: ${substituted}`);
        }
      }
    }
    expect(invalid).toEqual([]);
  });
});

describe('compiled utilities', () => {
  it('never emits a doubly-wrapped colour function', () => {
    expect(compiled).not.toMatch(/oklch\(\s*oklch\(/);
    expect(compiled).not.toMatch(/rgb\(\s*rgb\(/);
  });

  it('supports opacity modifiers, which need the <alpha-value> placeholder', () => {
    // Without `/ <alpha-value>` in the config these silently compile to nothing,
    // taking ~90 usages across the app with them.
    expect(compiled).toContain('bg-primary\\/90');
    expect(compiled).toContain('bg-sk-primary-fixed\\/30');
  });

  it('emits a dark-mode override for the core surface tokens', () => {
    expect(compiled).toMatch(/\.dark\s*\{[^}]*--background/);
  });
});
