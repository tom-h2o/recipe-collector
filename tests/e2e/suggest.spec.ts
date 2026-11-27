import { test, expect, type Page } from '@playwright/test';
import { installMockBackend, MOCK_RECIPES } from './support/mockBackend';

/**
 * "What can I cook?" in the app's own design: the sheet every short task
 * uses, progress and failures said inside it (not in a toast), what was typed
 * kept, and results as rows that open the recipe.
 */
async function open(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await installMockBackend(page);
  await page.goto('/');
  await expect(page.locator('.recipe-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Suggest a recipe' }).click();
  const sheet = page.getByRole('dialog', { name: 'What can I cook?' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('on a phone it is a sheet at the bottom, inside the screen', async ({ page }) => {
  const sheet = await open(page);
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBe(0);
  expect(Math.round(box.width)).toBe(390);
  expect(Math.round(box.y + box.height)).toBe(844);
  await expect(sheet.getByRole('button', { name: 'Suggest', exact: true })).toBeDisabled();
});

test('the button is the app\'s green, not a colour of its own', async ({ page }) => {
  const sheet = await open(page);
  await sheet.getByLabel('Ingredients you have').fill('tomatoes');
  const button = await sheet.getByRole('button', { name: 'Suggest', exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);
  // Compared with the one filled button of the top bar (behind the sheet, so
  // found by its label rather than by role).
  const add = await page.locator('header [aria-label="Add recipe"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(button).toBe(add);
});

test('suggestions are rows that open the recipe', async ({ page }) => {
  const sent: unknown[] = [];
  const sheet = await open(page);
  await page.route('**/api/suggest', (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [MOCK_RECIPES[1]] }) });
  });
  await sheet.getByLabel('Ingredients you have').fill('avocado, bread ,');
  await sheet.getByRole('button', { name: 'Suggest', exact: true }).click();

  const results = sheet.getByRole('region', { name: 'Suggestions' });
  await expect(results).toContainText('1 recipe fits');
  expect(sent).toEqual([{ ingredients: ['avocado', 'bread'] }]);
  // No toast: what happened is said in the sheet.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

  await results.getByRole('button', { name: /Avocado Toast/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cook', exact: true })).toBeVisible();
});

test('nothing fitting, and a failure, are both said in the sheet with the text kept', async ({ page }) => {
  const sheet = await open(page);
  let fail = false;
  await page.route('**/api/suggest', (route) => (fail
    ? route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Daily AI limit reached. Try again tomorrow.' }) })
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [] }) })));

  const field = sheet.getByLabel('Ingredients you have');
  await field.fill('saffron');
  await sheet.getByRole('button', { name: 'Suggest', exact: true }).click();
  await expect(sheet.getByText('Nothing fits yet')).toBeVisible();

  fail = true;
  await sheet.getByRole('button', { name: 'Suggest', exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText('Daily AI limit reached');
  await expect(sheet.getByText('Nothing fits yet')).toHaveCount(0);
  await expect(field).toHaveValue('saffron');
});
