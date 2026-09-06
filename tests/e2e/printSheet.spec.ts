import { test, expect } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

async function openRecipe(page: import('@playwright/test').Page) {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByText('Classic Margherita Pizza').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

const sheet = (page: import('@playwright/test').Page) => page.locator('.print-sheet');

test('the print sheet is invisible on screen', async ({ page }) => {
  await openRecipe(page);
  await expect(sheet(page)).toBeHidden();
});

test('printing shows the recipe and nothing else from the app', async ({ page }) => {
  await openRecipe(page);
  await page.emulateMedia({ media: 'print' });

  await expect(sheet(page)).toBeVisible();
  // The app chrome must not reach the paper: before this, printing produced the
  // drawer floating on a blurred backdrop with the header behind it.
  await expect(page.locator('header')).toBeHidden();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('carries what a cook needs, and nothing they cannot use', async ({ page }) => {
  await openRecipe(page);
  await page.emulateMedia({ media: 'print' });

  const s = sheet(page);
  await expect(s).toContainText('Classic Margherita Pizza');
  await expect(s).toContainText('Serves 2');
  await expect(s).toContainText('flour');
  await expect(s).toContainText('Prepare dough');
  await expect(s).toContainText('Nutrition, per serving');

  // Interactive controls are meaningless on paper.
  await expect(s.getByRole('button')).toHaveCount(0);
});

test('prints the scaled quantities, not the stored ones', async ({ page }) => {
  // The sheet derives from the same list the table renders, so a recipe scaled
  // on screen must not print its original amounts.
  await openRecipe(page);
  await page.getByRole('button', { name: 'Increase servings' }).click();
  await page.waitForTimeout(400);

  const shown = await page.getByRole('dialog').textContent();
  await page.emulateMedia({ media: 'print' });
  const printed = await sheet(page).textContent();

  expect(printed).toContain('Serves 3');
  // 300g at 2 servings becomes 450g at 3.
  if (shown?.includes('450')) expect(printed).toContain('450');
});

test('names the saved file after the recipe', async ({ page }) => {
  // Browsers use document.title as the default "Save as PDF" filename; without
  // this every exported recipe lands as "Speisekammer.pdf".
  await openRecipe(page);
  const during = await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'));
    const t = document.title;
    window.dispatchEvent(new Event('afterprint'));
    return t;
  });
  expect(during).toBe('Classic Margherita Pizza');
  expect(await page.title()).not.toBe('Classic Margherita Pizza');
});
