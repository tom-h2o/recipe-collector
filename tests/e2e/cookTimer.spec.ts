import { test, expect } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

async function openCookMode(page: import('@playwright/test').Page) {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByText('Classic Margherita Pizza').click();
  await page.getByRole('button', { name: /cook mode/i }).click();
}

test('offers a timer for a duration the step mentions', async ({ page }) => {
  await openCookMode(page);
  // "Bake at 400C for 12 minutes" — the duration becomes a chip.
  await expect(page.getByRole('button', { name: '12 min', exact: true })).toBeVisible();
});

test('does not offer a timer for an oven temperature', async ({ page }) => {
  // The same step says "400C". A chip reading "400" would be nonsense in front
  // of someone mid-cook, which is why the parser demands a unit word.
  await openCookMode(page);
  await expect(page.getByRole('button', { name: /^400/ })).toHaveCount(0);
});

test('runs, pauses and cancels', async ({ page }) => {
  await openCookMode(page);
  await page.getByRole('button', { name: '12 min', exact: true }).click();

  const clock = page.getByRole('timer');
  await expect(clock).toBeVisible();
  await expect(clock).toHaveText(/^1[12]:\d\d$/);

  await page.getByRole('button', { name: 'Pause timer' }).click();
  const paused = await clock.textContent();
  await page.waitForTimeout(1600);
  expect(await clock.textContent()).toBe(paused);

  await page.getByRole('button', { name: 'Resume timer' }).click();
  await expect(page.getByRole('button', { name: 'Pause timer' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel timer' }).click();
  await expect(clock).toHaveCount(0);
});

test('keeps running while the cook reads other steps', async ({ page }) => {
  // A timer set for step 1 is usually for something already on the heat; losing
  // it because the cook looked ahead would be the whole feature failing.
  await openCookMode(page);
  await page.getByRole('button', { name: '12 min', exact: true }).click();
  await expect(page.getByRole('timer')).toBeVisible();

  const next = page.getByRole('button', { name: /next/i });
  if (await next.count()) {
    await next.click();
    await expect(page.getByRole('timer')).toBeVisible();
  }
});

test('a manual timer is always available', async ({ page }) => {
  await openCookMode(page);
  await page.getByRole('button', { name: /^set a timer$/i }).click();
  await page.getByRole('button', { name: '5 min', exact: true }).click();
  await expect(page.getByRole('timer')).toBeVisible();
});
