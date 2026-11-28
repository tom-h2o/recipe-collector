/**
 * The app's languages: English (the source) and German.
 *
 * English text is the key. `t('Add recipe')` returns it unchanged in English
 * and looks it up in the German dictionary (src/i18n/de/) otherwise; a missing
 * entry falls back to English, and src/i18n/i18n.test.ts fails on one.
 *
 * Which language: the person's choice in Settings (stored per device, like the
 * theme, because the sign-in screen and the public pages need it before any
 * account exists), else the device's language.
 */
import { useSyncExternalStore } from 'react';
import { de, fragments } from './de';

export type Lang = 'en' | 'de';
/** 'system' follows the device. */
export type LanguagePreference = 'system' | Lang;
export type Vars = Record<string, string | number>;

export const UI_LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
];

const STORAGE_KEY = 'sk-language';
const DICTIONARIES: Record<Exclude<Lang, 'en'>, Record<string, string>> = { de };

function readPreference(): LanguagePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'de' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/**
 * The languages the device reports to a web page, in its order. Shown under
 * the language setting, because what a phone reports is not always the
 * language its own menus are in, and nothing else in the app reveals it.
 */
export function reportedLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  return list.map((tag) => String(tag ?? '')).filter(Boolean);
}

/** The first of the device's languages the app speaks; English otherwise. */
export function systemLanguage(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const wanted = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of wanted) {
    const base = String(tag ?? '').toLowerCase().split('-')[0];
    if (base === 'de' || base === 'en') return base;
  }
  return 'en';
}

let preference: LanguagePreference = readPreference();
let lang: Lang = preference === 'system' ? systemLanguage() : preference;
const listeners = new Set<() => void>();

// Through globalThis, with their shapes spelled out: tests/unit imports files
// that import this one, and that project is compiled without the DOM types.
const page = globalThis as {
  document?: { documentElement: { lang: string } };
  addEventListener?: (type: string, listener: () => void) => void;
};

function apply() {
  const next = preference === 'system' ? systemLanguage() : preference;
  if (page.document) page.document.documentElement.lang = next;
  if (next === lang) return;
  lang = next;
  translators.clear();
  listeners.forEach((l) => l());
}
if (page.document) page.document.documentElement.lang = lang;
// The device's language can change while the app is open (iOS: per-app language).
page.addEventListener?.('languagechange', apply);

export function getLanguage(): Lang {
  return lang;
}

export function getLanguagePreference(): LanguagePreference {
  return preference;
}

export function setLanguagePreference(next: LanguagePreference) {
  preference = next;
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode: the choice lasts until the page is closed.
  }
  apply();
  prefListeners.forEach((l) => l());
}
const prefListeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** `'Open##verb'` → `'Open'`: a key may carry a note that tells two uses of the same English apart. */
function withoutContext(key: string) {
  const at = key.indexOf('##');
  return at === -1 ? key : key.slice(0, at);
}

function translate(language: Lang, key: string, vars?: Vars): string {
  const found = language === 'en' ? undefined : DICTIONARIES[language][key];
  return fill(found ?? withoutContext(key), vars);
}

/**
 * Translate outside React (stores, helpers, toasts): reads the language at the
 * moment it is called. Inside a component use `useT()`, which also re-renders
 * when the language changes.
 */
export function t(key: string, vars?: Vars): string {
  return translate(lang, key, vars);
}

/** One or many: `tn(n, '{n} recipe', '{n} recipes')`. `{n}` is filled in. */
export function tn(n: number, one: string, other: string, vars?: Vars): string {
  return t(n === 1 ? one : other, { n, ...vars });
}

/**
 * Marks text that is translated later, where it is shown (`t(option.label)`):
 * labels in constants, lists built at import time. Returns it unchanged; the
 * dictionary test finds it by this call.
 */
export function msg(text: string): string {
  return text;
}

export type Translate = typeof t;
const translators = new Map<Lang, Translate>();

/** The translator for components. Its identity changes with the language, so it works as a hook dependency. */
export function useT(): Translate {
  const current = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  let fn = translators.get(current);
  if (!fn) {
    fn = (key, vars) => translate(current, key, vars);
    translators.set(current, fn);
  }
  return fn;
}

export function useLanguage(): Lang {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

/** The choice in Settings (which may be 'system') and its setter. */
export function useLanguagePreference(): [LanguagePreference, (next: LanguagePreference) => void] {
  const value = useSyncExternalStore(
    (l) => { prefListeners.add(l); return () => prefListeners.delete(l); },
    getLanguagePreference,
    getLanguagePreference,
  );
  return [value, setLanguagePreference];
}

/**
 * The locale for dates and numbers. German when the app is German; in English
 * whatever the call used before (`undefined` is the device's own format).
 */
export function dateLocale(english?: string): string | undefined {
  return lang === 'de' ? 'de-DE' : english;
}

// ── Text that arrives from the server ────────────────────────────────────────

let patterns: { regex: RegExp; names: string[]; german: string }[] | null = null;

function serverPatterns() {
  if (patterns) return patterns;
  patterns = [];
  // Only the server's own entries: a pattern from a screen's dictionary
  // ('{name} notes') would match text it was never written for.
  for (const [key, german] of Object.entries(fragments.server)) {
    if (!key.includes('{')) continue;
    const names: string[] = [];
    const source = key
      .split(/(\{\w+\})/)
      .map((part) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        if (name) { names.push(name); return '(.+?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    patterns.push({ regex: new RegExp(`^${source}$`, 's'), names, german });
  }
  return patterns;
}

/**
 * A message the app did not write itself: an API's `error`, a stored import
 * failure, Supabase's sign-in errors. Looked up as it is, then against the
 * dictionary's entries with placeholders ("Daily AI call limit reached
 * ({limit} calls/day)…"); unknown text is shown as it came.
 */
export function translateMessage(message: string): string {
  if (lang === 'en' || !message) return message;
  const exact = de[message];
  if (exact) return exact;
  for (const { regex, names, german } of serverPatterns()) {
    const match = regex.exec(message);
    if (!match) continue;
    const vars: Vars = {};
    names.forEach((name, i) => { vars[name] = match[i + 1]; });
    return fill(german, vars);
  }
  return message;
}

/** For tests: put the language back to what the device and storage say. */
export function resetLanguageForTests() {
  preference = readPreference();
  apply();
}
