import { test, expect } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * The action bar carried nine equal icons — Cook, Delete and Print all the
 * same size and colour, none labelled. Nothing said which one the recipe was
 * opened for, and the destructive one sat between two harmless ones.
 */
async function openRecipe(page: import('@playwright/test').Page) {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByText('Classic Margherita Pizza').click();
  await expect(page.getByRole('dialog').getByText('Prepare dough.', { exact: false })).toBeVisible();
  return page.getByRole('dialog');
}

test('cooking is the one labelled action', async ({ page }) => {
  const dialog = await openRecipe(page);
  await expect(dialog.getByRole('button', { name: 'Cook', exact: true })).toBeVisible();
});

test('the bar holds a handful of actions, not nine', async ({ page }) => {
  const dialog = await openRecipe(page);
  const bar = dialog.locator('div.flex.items-center.flex-wrap.pt-1').first();
  const buttons = await bar.getByRole('button').count();
  // Cook, translate, meal plan, send, and the menu trigger.
  expect(buttons, 'actions competing for attention in the bar').toBeLessThanOrEqual(5);
});

test('destructive and rare actions live in the menu', async ({ page }) => {
  const dialog = await openRecipe(page);

  // Not in the bar.
  await expect(dialog.getByRole('button', { name: /delete recipe/i })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /edit recipe/i })).toHaveCount(0);

  await dialog.getByTitle('More options').click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('button', { name: /edit recipe/i })).toBeVisible();
  await expect(menu.getByRole('button', { name: /print or save as pdf/i })).toBeVisible();
  await expect(menu.getByRole('button', { name: /delete recipe/i })).toBeVisible();
});

test('deleting sits last, after a separator', async ({ page }) => {
  // Position is the guard rail here: it must not end up next to something
  // harmless that gets tapped by reflex.
  const dialog = await openRecipe(page);
  await dialog.getByTitle('More options').click();

  const menu = page.getByRole('menu');
  const labels = await menu.getByRole('button').allInnerTexts();
  expect(labels[labels.length - 1]).toMatch(/delete recipe/i);
});

test('the delete confirmation has buttons big enough for a thumb', async ({ page }) => {
  // They were the default 32 px, small for a step that cannot be undone.
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openRecipe(page);
  await dialog.getByTitle('More options').click();
  await page.getByRole('menu').getByRole('button', { name: /delete recipe/i }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  // It scales in: measured mid-animation every box is a little smaller.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));
  for (const name of ['Cancel', 'Delete']) {
    const box = (await confirm.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    expect(box.width, name).toBeGreaterThanOrEqual(120);
  }
});
