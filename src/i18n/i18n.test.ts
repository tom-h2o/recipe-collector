import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { de, fragments } from './de';
import { t, tn, translateMessage, setLanguagePreference, systemLanguage, getLanguage, dateLocale } from './index';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Every literal handed to t(), tn(), msg() or rich(t, …) in the app's source. */
function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const literal = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|` + '`((?:[^`\\\\$]|\\\\.)*)`';
  const call = new RegExp(String.raw`(?<![\w.])(?:t|msg)\(\s*(?:${literal})|(?<![\w.])rich\(\s*t,\s*(?:${literal})`, 'g');
  const plural = new RegExp(String.raw`(?<![\w.])tn\(\s*[^,]+,\s*(?:${literal})\s*,\s*(?:${literal})`, 'g');
  const unescape = (s: string) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(call)) {
      const found = m.slice(1).find((g) => g !== undefined);
      if (found !== undefined) keys.set(unescape(found), file.slice(SRC.length + 1));
    }
    for (const m of text.matchAll(plural)) {
      const groups = m.slice(1).filter((g) => g !== undefined);
      for (const g of groups) keys.set(unescape(g), file.slice(SRC.length + 1));
    }
  }
  return keys;
}

describe('the German dictionary', () => {
  it('has every text the app translates', () => {
    const missing = [...usedKeys()].filter(([key]) => !(key in de)).map(([key, file]) => `${file}: ${key}`);
    expect(missing).toEqual([]);
  });

  it('never gives one text two different translations', () => {
    const seen = new Map<string, { german: string; where: string }>();
    const clashes: string[] = [];
    for (const [name, entries] of Object.entries(fragments)) {
      for (const [key, german] of Object.entries(entries)) {
        const before = seen.get(key);
        if (before && before.german !== german) clashes.push(`${key}: ${before.where} "${before.german}" / ${name} "${german}"`);
        seen.set(key, { german, where: name });
      }
    }
    expect(clashes).toEqual([]);
  });

  it('keeps every placeholder and every tag of the English text', () => {
    const marks = (s: string) => [...s.matchAll(/\{\w+\}|<\/?\w+\/?>/g)].map((m) => m[0]).sort();
    const broken = Object.entries(de).filter(([key, german]) => marks(key).join() !== marks(german).join()).map(([key]) => key);
    expect(broken).toEqual([]);
  });

  it('has no empty translation and does not address anyone as "Sie"', () => {
    expect(Object.entries(de).filter(([, german]) => !german.trim()).map(([key]) => key)).toEqual([]);
    const formal = Object.entries(de).filter(([, german]) => /\b(Ihre?[mnrs]?|Ihnen)\b/.test(german) || /(^|[.!?:] )Sie\b|\bkönnen Sie\b|\bSie (können|haben|müssen|sind)\b/.test(german));
    expect(formal.map(([key]) => key)).toEqual([]);
  });
});

describe('choosing the language', () => {
  afterEach(() => setLanguagePreference('system'));

  it('follows the device until the person chooses', () => {
    expect(systemLanguage()).toBe('en'); // jsdom reports en-US
    expect(getLanguage()).toBe('en');
    expect(t('Cancel')).toBe('Cancel');
    setLanguagePreference('de');
    expect(getLanguage()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(localStorage.getItem('sk-language')).toBe('de');
    expect(t('Cancel')).toBe('Abbrechen');
    setLanguagePreference('system');
    expect(localStorage.getItem('sk-language')).toBeNull();
    expect(t('Cancel')).toBe('Cancel');
  });

  it('takes the first device language the app speaks', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'languages');
    Object.defineProperty(window.navigator, 'languages', { value: ['fr-FR', 'de-AT', 'en'], configurable: true });
    expect(systemLanguage()).toBe('de');
    Object.defineProperty(window.navigator, 'languages', { value: ['pl'], configurable: true });
    expect(systemLanguage()).toBe('en');
    if (original) Object.defineProperty(window.navigator, 'languages', original);
    else delete (window.navigator as unknown as Record<string, unknown>).languages;
  });

  it('fills placeholders, strips a context note, and falls back to English', () => {
    expect(t('{n} left', { n: 3 })).toBe('3 left');
    expect(t('Open##verb')).toBe('Open');
    setLanguagePreference('de');
    expect(t('A text nobody translated')).toBe('A text nobody translated');
    expect(tn(1, '{n} thing nobody translated', '{n} things nobody translated')).toBe('1 thing nobody translated');
  });

  it('uses German dates in German and leaves English calls as they were', () => {
    expect(dateLocale('en-GB')).toBe('en-GB');
    expect(dateLocale()).toBeUndefined();
    setLanguagePreference('de');
    expect(dateLocale('en-GB')).toBe('de-DE');
  });
});

describe('messages from the server', () => {
  afterEach(() => setLanguagePreference('system'));

  it('are left alone in English and when unknown', () => {
    expect(translateMessage('Recipe not found.')).toBe('Recipe not found.');
    setLanguagePreference('de');
    expect(translateMessage('Something nobody wrote down')).toBe('Something nobody wrote down');
  });

  it('are translated in German, with their numbers and names', () => {
    setLanguagePreference('de');
    for (const [key, german] of Object.entries(fragments.server)) {
      if (!key.includes('{')) expect(translateMessage(key)).toBe(german);
    }
    const limit = translateMessage('Daily AI call limit reached (100 calls/day). Resets at midnight UTC.');
    expect(limit).toContain('100');
    expect(limit).not.toContain('Daily');
  });
});
