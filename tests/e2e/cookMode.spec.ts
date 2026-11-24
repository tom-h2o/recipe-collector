import { test, expect, type Page } from '@playwright/test';
import { installMockBackend, MOCK_RECIPES } from './support/mockBackend';

/**
 * Cook mode shows each step's ingredients under it, and the whole list as a
 * labelled button: a sheet from the bottom on a phone, so the step stays in
 * view, a panel beside the step from sm up. Ticks are shared between both.
 */

const SOUP = {
  ...MOCK_RECIPES[0],
  id: 'recipe-soup',
  title: 'Kürbissuppe',
  description: 'Cremig.',
  ingredients: [
    { amount: '1', name: 'Hokkaido-Kürbis', details: '' },
    { amount: '1', name: 'Zwiebel', details: '' },
    { amount: '2 Zehen', name: 'Knoblauch', details: '' },
    { amount: '800 ml', name: 'Gemüsebrühe', details: '' },
    { amount: '', name: 'Salz', details: '' },
  ],
  instructions: 'Kürbis würfeln, Zwiebeln und Knoblauch hacken.\nMit Brühe aufgießen und 20 Minuten köcheln.\nPürieren und servieren.',
  tags: [],
};

async function openCookMode(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await installMockBackend(page);
  await page.route('**/rest/v1/recipes?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SOUP]) }));
  await page.goto('/');
  await page.locator('.recipe-card', { hasText: 'Kürbissuppe' }).getByText('Kürbissuppe').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cook', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exit cook mode' })).toBeVisible();
}

test('each step shows the ingredients it mentions, and ticking one is shared with the list', async ({ page }) => {
  await openCookMode(page, 1280);
  const forStep = page.getByRole('region', { name: 'For this step' });
  await expect(forStep.getByRole('button')).toHaveText(['1Hokkaido-Kürbis', '1Zwiebel', '2 ZehenKnoblauch']);

  await forStep.getByRole('button', { name: /Zwiebel/ }).click();
  await expect(forStep.getByRole('button', { name: /Zwiebel/ })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: /Next/ }).click();
  await expect(forStep.getByRole('button')).toHaveText(['800 mlGemüsebrühe']);
  await page.getByRole('button', { name: /Next/ }).click();
  // Nothing on the list is named in the last step: no empty section.
  await expect(forStep).toHaveCount(0);

  // The full list beside the step knows about the tick.
  await page.getByRole('button', { name: 'Show ingredients' }).click();
  const list = page.getByRole('region', { name: 'Ingredients' });
  await expect(list.getByRole('button', { name: /Zwiebel/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(list).toContainText('1 of 5 done');
});

test('on a phone the list is labelled and opens as a sheet below the step', async ({ page }) => {
  await openCookMode(page, 390);
  const open = page.getByRole('button', { name: 'Show ingredients' });
  await expect(open).toContainText('Ingredients');
  await open.click();

  const sheet = page.getByRole('region', { name: 'Ingredients' });
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  // A sheet from the bottom, not a full-screen cover: the step stays in view.
  expect(box.y + box.height).toBeGreaterThan(790);
  expect(box.height).toBeLessThan(800 * 0.75);
  // Scoped to cook mode: the recipe behind it, and its print sheet, carry the same text.
  const cookMode = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Exit cook mode' }) });
  await expect(cookMode.getByText('Kürbis würfeln, Zwiebeln und Knoblauch hacken.')).toBeInViewport();

  await sheet.getByRole('button', { name: /Knoblauch/ }).click();
  await sheet.getByRole('button', { name: 'Hide ingredients' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'For this step' }).getByRole('button', { name: /Knoblauch/ })).toHaveAttribute('aria-pressed', 'true');
});
