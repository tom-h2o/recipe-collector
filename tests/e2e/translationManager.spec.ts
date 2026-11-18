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

test('marks the languages that are already translated', async ({ page }) => {
  await installMockBackend(page);
  await withTranslations(page, ['de']);
  await openPicker(page);

  const dialog = page.getByRole('dialog');
  // German is cached, so it carries the tick and can be deleted.
  await expect(dialog.locator('[aria-label="Already translated"]')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: /Delete the Deutsch translation/i })).toBeVisible();

  // French is not, so it offers neither.
  await expect(dialog.getByRole('button', { name: /Delete the Français translation/i })).toHaveCount(0);
});

test('offers nothing to delete when no translation exists', async ({ page }) => {
  await installMockBackend(page);
  await withTranslations(page, []);
  await openPicker(page);

  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[aria-label="Already translated"]')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Delete the/i })).toHaveCount(0);
});

test('deletes a single translation and stops advertising it', async ({ page }) => {
  await installMockBackend(page);
  await withTranslations(page, ['de']);
  await openPicker(page);

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Delete the Deutsch translation/i }).click();

  await expect(dialog.getByRole('button', { name: /Delete the Deutsch translation/i })).toHaveCount(0);
  await expect(dialog.locator('[aria-label="Already translated"]')).toHaveCount(0);
  // The other languages are untouched — this deletes one, not all of them.
  await expect(dialog.getByRole('button', { name: /Français/ })).toBeVisible();
});

test('the original language is never offered for deletion', async ({ page }) => {
  // There is no stored row for the original, so there is nothing to delete.
  await installMockBackend(page);
  await withTranslations(page, ['en']);
  await openPicker(page);

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: /Delete the English translation/i })).toHaveCount(0);
});
