import { test, expect, type Page } from '@playwright/test';
import { installMockBackend, MOCK_RECIPES } from './support/mockBackend';

/**
 * Translating must never trap the reader.
 *
 * Reported from use: opening a recipe started a Spanish translation by itself,
 * the language picker went grey, and there was no way to another language.
 * Three things combined:
 *
 *  - the display language was saved before the translation existed, so a
 *    failed or deleted translation left the recipe pointing at nothing;
 *  - opening such a recipe made a new translation unasked, on every open;
 *  - every language was disabled for as long as a translation was running,
 *    which can be a minute or more.
 */

const GERMAN = {
  recipe_id: 'recipe-a',
  language_code: 'de',
  title: 'Klassische Pizza Margherita',
  description: 'Einfache Pizza.',
  instructions: 'Teig vorbereiten.',
  ingredients: [
    { amount: '300g', name: 'Mehl', details: '' },
    { amount: '200g', name: 'Mozzarella', details: '' },
    { amount: '1 Dose', name: 'Tomaten', details: '' },
  ],
};

interface Backend {
  /** Languages with a stored row for recipe-a. */
  stored: Set<string>;
  /** What recipe-a's saved display language is. */
  displayLanguage: string | null;
  /** Every display language the app tried to save, in order. */
  saved: (string | null)[];
  translateCalls: string[];
}

/** A backend that behaves like one: rows exist or do not, and a save is remembered. */
async function withBackend(page: Page, initial: { stored?: string[]; displayLanguage?: string | null }) {
  const state: Backend = {
    stored: new Set(initial.stored ?? []),
    displayLanguage: initial.displayLanguage ?? null,
    saved: [],
    translateCalls: [],
  };
  await installMockBackend(page);

  await page.route('**/rest/v1/recipes**', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as { preferred_language?: string | null };
      if ('preferred_language' in body) {
        state.displayLanguage = body.preferred_language ?? null;
        state.saved.push(state.displayLanguage);
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'recipe-a' }]) });
    }
    const recipes = MOCK_RECIPES.map((r) => r.id === 'recipe-a' ? { ...r, preferred_language: state.displayLanguage } : r);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(recipes) });
  });

  await page.route('**/rest/v1/recipe_translations**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'DELETE') {
      const code = url.searchParams.get('language_code')?.replace('eq.', '') ?? '';
      state.stored.delete(code);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 't1' }]) });
    }
    // A read for one language returns that row or nothing; a read without one lists them all.
    const wanted = url.searchParams.get('language_code')?.replace('eq.', '');
    const codes = [...state.stored].filter((c) => !wanted || c === wanted);
    const rows = codes.map((c) => ({ ...GERMAN, language_code: c }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });

  return state;
}

async function openRecipe(page: Page) {
  await page.goto('/');
  // The card may carry either title, depending on the display language.
  await page.locator('[role="button"], article, div').filter({ hasText: /Margherita/ }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

const chip = (page: Page, name: string) => page.getByRole('dialog').getByRole('button', { name: new RegExp(`^.*${name}`) });

test('opening a recipe never starts a translation by itself', async ({ page }) => {
  // The stuck state: Spanish is the saved display language and nothing is stored for it.
  const backend = await withBackend(page, { displayLanguage: 'es' });
  await page.route('**/api/translate', async (route) => {
    backend.translateCalls.push('called');
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'should not be asked' }) });
  });

  await openRecipe(page);
  const dialog = page.getByRole('dialog');

  // The original is shown, and the recipe is put back on it for next time.
  await expect(dialog.getByRole('heading', { name: 'Classic Margherita Pizza' })).toBeVisible();
  await expect.poll(() => backend.saved).toEqual([null]);
  expect(backend.translateCalls).toEqual([]);

  // And the picker is usable.
  await dialog.getByTitle('Translate recipe').click();
  await expect(chip(page, 'Deutsch')).toBeEnabled();
  await expect(chip(page, 'Español')).toBeEnabled();
});

test('a translation that is taking long does not lock the other languages', async ({ page }) => {
  const backend = await withBackend(page, { stored: ['de'] });
  // Spanish never answers: the worst case of "slow".
  await page.route('**/api/translate', async (route) => {
    backend.translateCalls.push('es');
    await new Promise(() => undefined);
    await route.abort();
  });

  await openRecipe(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByTitle('Translate recipe').click();

  await chip(page, 'Español').click();
  await expect(dialog.locator('[aria-label="Translating"]')).toBeVisible();
  // The recipe goes on showing what it showed.
  await expect(dialog.getByRole('heading', { name: 'Classic Margherita Pizza' })).toBeVisible();

  // Every language is still there to choose.
  for (const name of ['English', 'Deutsch', 'Français', 'Español']) {
    await expect(chip(page, name)).toBeEnabled();
  }

  // Choosing one abandons the slow translation and shows the stored one.
  await chip(page, 'Deutsch').click();
  await expect(dialog.getByRole('heading', { name: 'Klassische Pizza Margherita' })).toBeVisible();
  await expect(dialog.locator('[aria-label="Translating"]')).toHaveCount(0);
  // Spanish was never saved as the display language.
  expect(backend.saved).toEqual(['de']);
});

test('choosing the original stops a translation that is being made', async ({ page }) => {
  const backend = await withBackend(page, {});
  await page.route('**/api/translate', async () => { await new Promise(() => undefined); });

  await openRecipe(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByTitle('Translate recipe').click();

  await chip(page, 'Español').click();
  await expect(dialog.locator('[aria-label="Translating"]')).toBeVisible();

  await chip(page, 'English').click();
  await expect(dialog.locator('[aria-label="Translating"]')).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: 'Classic Margherita Pizza' })).toBeVisible();
  expect(backend.saved).toEqual([]);
});

test('a translation that fails leaves the recipe as it was', async ({ page }) => {
  // Otherwise the failure sticks: the recipe points at a language with nothing
  // behind it, and the next open starts over.
  const backend = await withBackend(page, {});
  await page.route('**/api/translate', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'The translation came back garbled (it has 1 step where the recipe has 4), so it was not saved. Please try again.' }),
  }));

  await openRecipe(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByTitle('Translate recipe').click();
  await chip(page, 'Español').click();

  await expect(page.getByText('The translation came back garbled', { exact: false })).toBeVisible();
  await expect(dialog.locator('[aria-label="Translating"]')).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: 'Classic Margherita Pizza' })).toBeVisible();
  // Nothing was saved, so there is nothing to get stuck on.
  expect(backend.saved).toEqual([]);
});

test('the display language is saved once the translation exists, not before', async ({ page }) => {
  const backend = await withBackend(page, {});
  let release: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/translate', async (route) => {
    await answered;
    backend.stored.add('de');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...GERMAN, cached: false }) });
  });

  await openRecipe(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByTitle('Translate recipe').click();
  await chip(page, 'Deutsch').click();
  await expect(dialog.locator('[aria-label="Translating"]')).toBeVisible();

  // Still being made: nothing saved yet.
  expect(backend.saved).toEqual([]);

  release();
  await expect(dialog.getByRole('heading', { name: 'Klassische Pizza Margherita' })).toBeVisible();
  await expect.poll(() => backend.saved).toEqual(['de']);
});

test('the translation on screen can be deleted right there', async ({ page }) => {
  // Where a faulty translation is noticed is while reading it.
  const backend = await withBackend(page, { stored: ['de'], displayLanguage: 'de' });

  await openRecipe(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Klassische Pizza Margherita' })).toBeVisible();
  await dialog.getByTitle('Translate recipe').click();

  await dialog.getByRole('button', { name: 'Delete this translation' }).click();

  await expect(dialog.getByRole('heading', { name: 'Classic Margherita Pizza' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Delete this translation' })).toHaveCount(0);
  expect(backend.stored.has('de')).toBe(false);
});

test('there is nothing to delete while the original is on screen', async ({ page }) => {
  await withBackend(page, { stored: ['de'] });
  await openRecipe(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByTitle('Translate recipe').click();
  await expect(chip(page, 'Deutsch')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Delete this translation' })).toHaveCount(0);
});
