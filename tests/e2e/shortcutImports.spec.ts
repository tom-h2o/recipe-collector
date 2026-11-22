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
  await expect.poll(() => patches.some((p) => p.url.includes('id=eq.imp-4'))).toBe(true);
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

const LINK = 'https://www.icloud.com/shortcuts/5f2b0c3a9e4d4b8f8c2a1d6e7f9a0b1c';

async function serveSettingsRow(page: Page, shortcutUrl: string | null) {
  await page.route('**/rest/v1/settings*', (route) => {
    const url = route.request().url();
    const body = url.includes('id=eq.1')
      ? { gemini_model: 'claude-sonnet-5-5', task_models: {}, shortcut_url: shortcutUrl }
      : { temperature_unit: 'C' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/account?tab=shortcut-key', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ hasKey: true, created_at: '2026-11-22T10:00:00Z', last_used_at: null }),
  }));
}

test('once the admin has shared the Shortcut, everyone gets an Add to Shortcuts button', async ({ page }) => {
  await installMockBackend(page, { email: 'cook@example.com' });
  await serveSettingsRow(page, LINK);
  await page.goto('/');
  await page.getByTitle('Settings').click();

  const section = page.getByRole('region', { name: 'iPhone Shortcut' });
  await expect(section.getByRole('link', { name: 'Add to Shortcuts' })).toHaveAttribute('href', LINK);
  // The build steps stay, folded away as the fallback.
  await expect(section.getByText('Build the Shortcut yourself instead')).toBeVisible();
  // Only the admin can set the link.
  await expect(section.getByRole('form', { name: 'Shared Shortcut link' })).toHaveCount(0);
});

test('without a shared link there is no button, only the build steps', async ({ page }) => {
  await installMockBackend(page, { email: 'cook@example.com' });
  await serveSettingsRow(page, null);
  await page.goto('/');
  await page.getByTitle('Settings').click();
  const section = page.getByRole('region', { name: 'iPhone Shortcut' });
  await expect(section.getByText('How to set up the Shortcut')).toBeVisible();
  await expect(section.getByRole('link', { name: 'Add to Shortcuts' })).toHaveCount(0);
});

test('the admin pastes the iCloud link, and the server is what checks it', async ({ page }) => {
  await installMockBackend(page);
  await serveSettingsRow(page, null);
  const posted: unknown[] = [];
  await page.route('**/api/account?action=shortcut-url', (route) => {
    const body = route.request().postDataJSON() as { url: string };
    posted.push(body);
    return body.url.startsWith('https://www.icloud.com/shortcuts/')
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: body.url }) })
      : route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Paste the iCloud link from the Shortcuts app (it starts with https://www.icloud.com/shortcuts/).' }) });
  });
  await page.goto('/');
  await page.getByTitle('Settings').click();

  const form = page.getByRole('form', { name: 'Shared Shortcut link' });
  await form.getByRole('textbox').fill('https://example.com/not-a-shortcut');
  await form.getByRole('button', { name: 'Save link' }).click();
  await expect(form.getByRole('alert')).toContainText('iCloud link');

  await form.getByRole('textbox').fill(LINK);
  await form.getByRole('button', { name: 'Save link' }).click();
  const section = page.getByRole('region', { name: 'iPhone Shortcut' });
  await expect(section.getByRole('link', { name: 'Add to Shortcuts' })).toHaveAttribute('href', LINK);
  expect(posted).toEqual([{ url: 'https://example.com/not-a-shortcut' }, { url: LINK }]);
});
