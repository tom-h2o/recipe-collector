import { test, expect } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * Opening the vault used to issue five identical recipe queries, each setting
 * loading: true and repainting the grid — which is what made the cards blink
 * before settling. Two came from fetchRecipes being called in both the initial
 * effect and the debounced one; the rest from `memberships` arriving and
 * retriggering the debounced effect with nothing about the result changed.
 */
test('opening the vault issues one recipe query, not five', async ({ page }) => {
  await installMockBackend(page);

  const queries: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/rest/v1/recipes?select=*')) queries.push(u);
  });

  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza')).toBeVisible();
  await page.waitForTimeout(1500);   // well past the 300ms debounce

  expect(queries.length, `recipe queries on startup:\n${queries.join('\n')}`).toBe(1);
});
