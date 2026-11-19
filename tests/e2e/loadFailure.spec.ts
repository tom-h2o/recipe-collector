import { test, expect } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * A view whose file will not load.
 *
 * This went wrong twice. First it left a white page, because the lazy views
 * sat under no error boundary. Then the fix for that reloaded the page — and
 * on a file that could never load, reloaded it again on every load, which a
 * person sees as a page that flickers and cannot be used.
 *
 * What must hold: the page settles, and it says something.
 */
test('a view that cannot load shows a message instead of a blank or reloading page', async ({ page }) => {
  await installMockBackend(page);

  let navigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });

  // The dev server serves lazy views from /src; a production build would ask
  // for a fingerprinted chunk. Either way the import rejects.
  await page.route('**/src/components/RecipeVault.tsx*', (route) => route.abort());

  await page.goto('/');

  const failure = page.getByRole('alert');
  await expect(failure).toBeVisible();
  await expect(failure.getByRole('heading')).toHaveText('Part of Speisekammer could not be loaded');
  // The one fact that tells a stale cache from a blocked request.
  await expect(failure).toContainText('RecipeVault');
  await expect(failure.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
  await expect(failure.getByRole('button', { name: 'Reset saved app files and reload' })).toBeVisible();

  // Give a reload loop every chance to show itself, then count.
  await page.waitForTimeout(3000);
  await expect(failure).toBeVisible();
  // The first load, plus at most the one automatic reload.
  expect(navigations).toBeLessThanOrEqual(2);
});

test('the failure screen is not shown when everything loads', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
