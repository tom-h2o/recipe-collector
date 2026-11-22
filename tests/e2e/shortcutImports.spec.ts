import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * Recipes sent from the iPhone Shortcut are saved straight away and announced
 * the next time the app is opened: a banner (new, still being read, could not
 * be read), a New badge on each card, a way to show only those, and the badge
 * gone once the recipe has been opened. Settings makes and shows the key.
 */

const IMPORTS = [
  { id: 'imp-1', status: 'saved', recipe_id: 'recipe-a', error: null, page_count: 2, created_at: '2026-11-22T10:00:00Z' },
  { id: 'imp-2', status: 'saved', recipe_id: 'recipe-b', error: null, page_count: 1, created_at: '2026-11-22T10:01:00Z' },
  { id: 'imp-3', status: 'processing', recipe_id: null, error: null, page_count: 1, created_at: '2026-11-22T10:02:00Z' },
  { id: 'imp-4', status: 'failed', recipe_id: null, error: 'No recipe could be read from this picture.', page_count: 1, created_at: '2026-11-22T10:03:00Z' },
];

async function serveImports(page: Page) {
  const patches: { url: string; body: unknown }[] = [];
  const recipeQueries: string[] = [];
  await page.route('**/rest/v1/recipe_imports*', async (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      patches.push({ url: decodeURIComponent(req.url()), body: req.postDataJSON() });
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(IMPORTS) });
  });
  // Observe, then let the mock backend answer.
  await page.route('**/rest/v1/recipes*', async (route) => {
    recipeQueries.push(decodeURIComponent(route.request().url()));
    return route.fallback();
  });
  return { patches, recipeQueries };
}

test('announces what the Shortcut sent, shows just those, and forgets each once opened', async ({ page }) => {
  await installMockBackend(page);
  const { patches, recipeQueries } = await serveImports(page);
  await page.goto('/');

  const banner = page.getByRole('region', { name: 'Recipes from your photos' });
  await expect(banner).toContainText('2 new recipes from your photos');
  await expect(banner).toContainText('Reading a picture from your photos');
  await expect(banner).toContainText('No recipe could be read from this picture.');

  const pizza = page.locator('.recipe-card', { hasText: 'Classic Margherita Pizza' });
  const toast = page.locator('.recipe-card', { hasText: 'Avocado Toast' });
  await expect(pizza.getByText('New', { exact: true })).toBeVisible();
  await expect(toast.getByText('New', { exact: true })).toBeVisible();

  await banner.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByRole('button', { name: '🆕 New from photos' })).toBeVisible();
  await expect.poll(() => recipeQueries.some((q) => q.includes('id=in.(recipe-a,recipe-b)'))).toBe(true);

  // Opening a recipe counts as having seen it.
  await pizza.click();
  await expect.poll(() => patches.find((p) => p.url.includes('recipe_id=eq.recipe-a'))).toBeTruthy();
  expect((patches.find((p) => p.url.includes('recipe_id=eq.recipe-a'))?.body as { seen_at?: string }).seen_at).toBeTruthy();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(pizza.getByText('New', { exact: true })).toHaveCount(0);
  await expect(banner).toContainText('1 new recipe from your photos');

  // A failure is closed by hand.
  await banner.getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner).not.toContainText('could not be read');
  expect(patches.some((p) => p.url.includes('id=eq.imp-4'))).toBe(true);
});

test('shows nothing when nothing new arrived', async ({ page }) => {
  await installMockBackend(page);
  await page.route('**/rest/v1/recipe_imports*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/');
  await expect(page.locator('.recipe-card').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recipes from your photos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '🆕 New from photos' })).toHaveCount(0);
  await expect(page.locator('.recipe-card').getByText('New', { exact: true })).toHaveCount(0);
});

test('Settings makes a Shortcut key and shows it once', async ({ page }) => {
  await installMockBackend(page);
  let hasKey = false;
  await page.route('**/api/account?tab=shortcut-key', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(hasKey ? { hasKey, created_at: '2026-11-22T10:00:00Z', last_used_at: null } : { hasKey, created_at: null, last_used_at: null }),
  }));
  await page.route('**/api/account?action=shortcut-key', (route) => {
    hasKey = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'spk_test-key-shown-once', created_at: '2026-11-22T10:00:00Z' }) });
  });
  await page.goto('/');
  await page.getByTitle('Settings').click();

  const section = page.getByRole('region', { name: 'iPhone Shortcut' });
  await expect(section).toContainText('No key yet');
  await section.getByRole('button', { name: 'Create key' }).click();
  await expect(page.getByTestId('shortcut-key')).toHaveText('spk_test-key-shown-once');
  await expect(section).toContainText('shown only this once');
  await expect(section).toContainText('not used yet');
  await section.getByText('How to set up the Shortcut').click();
  await expect(section.getByText(/\/api\/extract\?via=shortcut$/)).toBeVisible();
});
