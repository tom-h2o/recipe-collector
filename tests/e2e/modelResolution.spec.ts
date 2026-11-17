import { test, expect } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * An alias hides which model is really doing the work, and Google moves them
 * without notice — gemini-flash-latest went 3.7 -> 3.8 silently, then stayed on
 * the 3.x tier when Gemini 4 shipped under new names. Settings therefore reports
 * what each id *actually* ran as, taken from real calls, never inferred.
 */
async function openSettings(page: import('@playwright/test').Page, logs: unknown[]) {
  await installMockBackend(page);
  await page.route('**/rest/v1/gemini_logs**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(logs) });
  });
  await page.goto('/');
  await page.getByTitle('Settings').click();
  await page.getByText('Gemini Model').waitFor();
}

test('shows what an alias actually resolved to', async ({ page }) => {
  await openSettings(page, [
    { model: 'gemini-flash-lite-latest', model_version: 'gemini-3.5-flash-lite', created_at: '2026-11-18T10:00:00Z', endpoint: 'tag' },
  ]);

  const row = page.locator('div', { hasText: /^gemini-flash-lite-latest/ }).last();
  await expect(row).toContainText('gemini-3.5-flash-lite');
  await expect(row).toContainText('alias', { ignoreCase: true });
});

test('says so when a model has never run, instead of inventing a resolution', async ({ page }) => {
  // Claiming a resolution nobody has observed would be the same false
  // confidence the alias already creates.
  await openSettings(page, []);
  await expect(page.getByText('not used yet').first()).toBeVisible();
});

test('reports the newest resolution when a model has moved', async ({ page }) => {
  await openSettings(page, [
    { model: 'gemini-flash-lite-latest', model_version: 'gemini-3.5-flash-lite', created_at: '2026-11-18T10:00:00Z', endpoint: 'tag' },
    { model: 'gemini-flash-lite-latest', model_version: 'gemini-3.1-flash-lite', created_at: '2026-01-01T10:00:00Z', endpoint: 'tag' },
  ]);

  const row = page.locator('div', { hasText: /^gemini-flash-lite-latest/ }).last();
  await expect(row).toContainText('gemini-3.5-flash-lite');
  await expect(row).not.toContainText('gemini-3.1-flash-lite');
});
