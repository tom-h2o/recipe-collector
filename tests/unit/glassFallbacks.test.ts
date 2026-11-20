import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Glass has to step back in three situations. Two of them can be switched on
 * in a browser and are covered in tests/e2e/liquidGlass.spec.ts. The third —
 * a browser with no backdrop blur at all — cannot be emulated, so its rule is
 * checked here as text. Translucency without blur is just text showing
 * through text.
 */
const css = readFileSync(join(__dirname, '..', '..', 'src', 'index.css'), 'utf8');

/** The body of the first at-rule whose prelude matches, braces balanced. */
function atRule(prelude: RegExp): string {
  const start = css.search(prelude);
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return '';
}

describe('glass fallbacks', () => {
  it('goes solid where the browser cannot blur', () => {
    const rule = atRule(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
    expect(rule).toMatch(/--glass-alpha:\s*1\s*!important;/);
    expect(rule).toMatch(/\[class\*='glass'\]/);
  });

  it('goes solid and stops blurring for "reduce transparency"', () => {
    const rule = atRule(/@media \(prefers-reduced-transparency: reduce\)/);
    expect(rule).toMatch(/--glass-alpha:\s*1\s*!important;/);
    expect(rule).toMatch(/--glass-blur:\s*none\s*!important;/);
    expect(rule).toMatch(/\[class\*='glass'\]/);
  });

  it('no variant can escape the fallbacks by setting its own alpha', () => {
    // .glass-menu, .glass-control and .glass-dark each set --glass-alpha. A
    // fallback that only reset :root would leave every one of them
    // translucent, so both fallbacks name all glass classes and are !important.
    const variants = css.match(/\.glass-[a-z]+\s*\{[^}]*--glass-alpha:[^}]*\}/g) ?? [];
    expect(variants.length).toBeGreaterThanOrEqual(3);
    for (const variant of variants) {
      // None of them may itself be !important, or it would win over the fallback.
      expect(variant).not.toMatch(/--glass-alpha:[^;]*!important/);
    }
  });

  it('stops giving way and springing for "reduce motion", but keeps the fade', () => {
    const rule = atRule(/@media \(prefers-reduced-motion: reduce\)/);
    expect(rule).toMatch(/button\[data-pressed\]\s*\{\s*scale:\s*none;/);
    expect(rule).not.toMatch(/press-spring/);
    expect(rule).toMatch(/press-fade/);
  });

  it('writes both the prefixed and the standard blur, for Safari', () => {
    expect(css).toMatch(/-webkit-backdrop-filter:\s*var\(--glass-blur\);\s*backdrop-filter:\s*var\(--glass-blur\);/);
  });

  it('takes every glass surface from the same two tokens', () => {
    // If a surface hard-codes its own alpha, the fallbacks above miss it.
    const surfaces = css.match(/\.glass(-bar)?\s*\{[^}]*\}/g) ?? [];
    expect(surfaces.length).toBeGreaterThanOrEqual(2);
    for (const surface of surfaces) {
      expect(surface).toMatch(/rgb\(var\(--glass-surface\) \/ var\(--glass-alpha\)\)/);
    }
  });
});
