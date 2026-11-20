import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * The language picker could not say which languages a recipe already had.
 * That matters because a cached translation is free to open while a new one
 * spends a call from the daily allowance — the two looked identical.
 */
async function withTranslations(page: Page, languages: string[]) {
  // Registered after installMockBackend so it wins: Playwright matches the
  // most recently added route first.
  let deleted = false;
  await page.route('**/rest/v1/recipe_translations**', async (route) => {
    if (route.request().method() === 'DELETE') {
      deleted = true;
      // PostgREST returns the affected rows when asked for them.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 't1' }]) });
    }
    const rows = deleted ? [] : languages.map((code) => ({ language_code: code }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
}

async function openPicker(page: Page) {
  await page.goto('/');
  await page.getByText('Classic Margherita Pizza').click();
  await expect(page.getByRole('dialog').getByText('Prepare dough.', { exact: false })).toBeVisible();
  await page.getByRole('dialog').getByTitle('Translate recipe').click();
}

/** The options menu behind the three dots, where deleting a translation lives. */
async function openMenu(page: Page) {
  await page.getByRole('dialog').getByTitle('More options').click();
}

test('marks the languages that are already translated', async ({ page }) => {
  await installMockBackend(page);
  await withTranslations(page, ['de']);
  await openPicker(page);

  // German is stored, so it carries the tick. French is not.
  await expect(page.getByRole('dialog').locator('[aria-label="Already translated"]')).toHaveCount(1);
});

test('the language chips offer nothing to delete', async ({ page }) => {
  // A cross on every translated language made the picker look like a list of
  // things to remove. Deleting is rare: it belongs in the menu.
  await installMockBackend(page);
  await withTranslations(page, ['de', 'fr']);
  await openPicker(page);

  await expect(page.getByRole('dialog').getByRole('button', { name: /Delete/i })).toHaveCount(0);
});

test('the menu offers to delete each stored translation and nothing else', async ({ page }) => {
  await installMockBackend(page);
  await withTranslations(page, ['de']);
  await openPicker(page);
  await openMenu(page);

  await expect(page.getByRole('button', { name: 'Delete Deutsch translation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete Français translation' })).toHaveCount(0);
});

test('the menu has no translation entry when none is stored', async ({ page }) => {
  await installMockBackend(page);
  await withTranslations(page, []);
  await openPicker(page);
  await openMenu(page);

  await expect(page.getByRole('button', { name: /Delete .* translation/ })).toHaveCount(0);
  // The menu itself is there.
  await expect(page.getByRole('button', { name: 'Delete recipe' })).toBeVisible();
});

test('deleting one translation removes its tick and its menu entry', async ({ page }) => {
  await installMockBackend(page);
  await withTranslations(page, ['de']);
  await openPicker(page);
  await openMenu(page);

  await page.getByRole('button', { name: 'Delete Deutsch translation' }).click();

  await expect(page.getByText('Deutsch translation deleted.', { exact: false })).toBeVisible();
  await expect(page.getByRole('dialog').locator('[aria-label="Already translated"]')).toHaveCount(0);
  await openMenu(page);
  await expect(page.getByRole('button', { name: 'Delete Deutsch translation' })).toHaveCount(0);
});

test('a stored translation of the original language can be deleted too', async ({ page }) => {
  // The model writes a row for the original whenever it is asked to translate
  // into a language it then reports as the source, and original_language is
  // itself only the model's guess. That row is never shown, so it has to be
  // reachable without being the language on screen.
  await installMockBackend(page);
  await withTranslations(page, ['en']);
  await openPicker(page);
  await openMenu(page);

  await expect(page.getByRole('button', { name: 'Delete English translation' })).toBeVisible();
});

test('after deleting a translation, choosing the language again makes a new one', async ({ page }) => {
  // THE reported fault: the cross disappeared, a confirmation came up, and the
  // translation was still there. The row was gone, but the copy held in memory
  // was not, and the drawer prefers that copy to asking the server. So picking
  // the language again showed the deleted translation, and no new one was made
  // until the page was reloaded.
  await installMockBackend(page);

  // A table that behaves like one: translating stores a row, deleting removes it.
  let stored = false;
  await page.route('**/rest/v1/recipe_translations**', async (route) => {
    if (route.request().method() === 'DELETE') {
      stored = false;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 't1' }]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stored ? [{ language_code: 'de' }] : []) });
  });

  let calls = 0;
  await page.route('**/api/translate', async (route) => {
    calls += 1;
    stored = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recipe_id: 'recipe-a',
        language_code: 'de',
        // The first one is the bad one; the second is what a retry returns.
        title: calls === 1 ? 'Pizza, schlecht übersetzt' : 'Klassische Pizza Margherita',
        description: 'Einfache Pizza.',
        instructions: 'Teig vorbereiten.',
        ingredients: [
          { amount: '300g', name: 'Mehl', details: '' },
          { amount: '200g', name: 'Mozzarella', details: '' },
          { amount: '1 Dose', name: 'Tomaten', details: '' },
        ],
        cached: false,
      }),
    });
  });

  await openPicker(page);
  const dialog = page.getByRole('dialog');

  await dialog.getByRole('button', { name: /Deutsch/ }).click();
  await expect(dialog.getByRole('heading', { name: 'Pizza, schlecht übersetzt' })).toBeVisible();
  expect(calls).toBe(1);

  await openMenu(page);
  await page.getByRole('button', { name: 'Delete Deutsch translation' }).click();
  // Back on the original: there is nothing left to show in German.
  await expect(dialog.getByRole('heading', { name: 'Classic Margherita Pizza' })).toBeVisible();

  await dialog.getByRole('button', { name: /Deutsch/ }).click();
  await expect(dialog.getByRole('heading', { name: 'Klassische Pizza Margherita' })).toBeVisible();
  expect(calls).toBe(2);
});
