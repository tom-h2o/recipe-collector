import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';
import { SAFARI_SHORTCUT_SCRIPT } from '../../shared/safariShortcut';

/**
 * Recipes sent from the iPhone Shortcuts (Photos and Safari) are saved straight
 * away and announced the next time the app is opened: a banner (new, still
 * being read, could not be read), a New badge on each card, a way to show only
 * those, and the badge gone once the recipe has been opened. Settings makes
 * and shows the key, and offers both Shortcuts.
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

  const banner = page.getByRole('region', { name: 'Recipes from your iPhone' });
  await expect(banner).toContainText('2 new recipes from your iPhone');
  await expect(banner).toContainText('Reading a picture from your photos');
  await expect(banner).toContainText('No recipe could be read from this picture.');

  const pizza = page.locator('.recipe-card', { hasText: 'Classic Margherita Pizza' });
  const toast = page.locator('.recipe-card', { hasText: 'Avocado Toast' });
  await expect(pizza.getByText('New', { exact: true })).toBeVisible();
  await expect(toast.getByText('New', { exact: true })).toBeVisible();

  await banner.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByRole('button', { name: 'New from iPhone' })).toBeVisible();
  await expect.poll(() => recipeQueries.some((q) => q.includes('id=in.(recipe-a,recipe-b)'))).toBe(true);

  // Opening a recipe counts as having seen it.
  await pizza.click();
  await expect.poll(() => patches.find((p) => p.url.includes('recipe_id=eq.recipe-a'))).toBeTruthy();
  expect((patches.find((p) => p.url.includes('recipe_id=eq.recipe-a'))?.body as { seen_at?: string }).seen_at).toBeTruthy();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(pizza.getByText('New', { exact: true })).toHaveCount(0);
  await expect(banner).toContainText('1 new recipe from your iPhone');

  // A failure is closed by hand.
  await banner.getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner).not.toContainText('could not be read');
  await expect.poll(() => patches.some((p) => p.url.includes('id=eq.imp-4'))).toBe(true);
});

test('a page sent from Safari is spoken of as a page', async ({ page }) => {
  await installMockBackend(page);
  await page.route('**/rest/v1/recipe_imports*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: 'imp-p1', status: 'processing', source: 'page', recipe_id: null, error: null, page_count: 1, created_at: '2026-11-22T11:00:00Z' },
      { id: 'imp-p2', status: 'failed', source: 'page', recipe_id: null, error: 'No recipe was found on this page.', page_count: 1, created_at: '2026-11-22T11:01:00Z' },
    ]),
  }));
  await page.goto('/');
  const banner = page.getByRole('region', { name: 'Recipes from your iPhone' });
  await expect(banner).toContainText('Reading a page from Safari');
  await expect(banner).toContainText('A page from Safari could not be read. No recipe was found on this page.');
  await expect(banner).not.toContainText('picture');
});

test('a link sent from another app is spoken of as a link', async ({ page }) => {
  await installMockBackend(page);
  await page.route('**/rest/v1/recipe_imports*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: 'imp-l1', status: 'processing', source: 'link', recipe_id: null, error: null, page_count: 1, created_at: '2026-11-24T11:00:00Z' },
      { id: 'imp-l2', status: 'failed', source: 'link', recipe_id: null, error: 'No recipe was found in this post\'s caption.', page_count: 1, created_at: '2026-11-24T11:01:00Z' },
    ]),
  }));
  await page.goto('/');
  const banner = page.getByRole('region', { name: 'Recipes from your iPhone' });
  await expect(banner).toContainText('Reading a shared link');
  await expect(banner).toContainText('A shared link could not be read. No recipe was found in this post\'s caption.');
  await expect(banner).not.toContainText('picture');
  await expect(banner).not.toContainText('Safari');
});

test('shows nothing when nothing new arrived', async ({ page }) => {
  await installMockBackend(page);
  await page.route('**/rest/v1/recipe_imports*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/');
  await expect(page.locator('.recipe-card').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recipes from your iPhone' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New from iPhone' })).toHaveCount(0);
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
  const photos = section.getByRole('region', { name: 'From the Photos app' });
  await photos.getByText('How to set up the Shortcut').click();
  await expect(photos.getByText(/\/api\/extract\?via=shortcut$/)).toBeVisible();
});

const LINK = 'https://www.icloud.com/shortcuts/5f2b0c3a9e4d4b8f8c2a1d6e7f9a0b1c';

async function serveSettingsRow(page: Page, shortcutUrl: string | null, safariUrl: string | null = null, linkUrl: string | null = null) {
  await page.route('**/rest/v1/settings*', (route) => {
    const url = route.request().url();
    const body = url.includes('id=eq.1')
      ? { gemini_model: 'claude-sonnet-5-5', task_models: {}, shortcut_url: shortcutUrl, safari_shortcut_url: safariUrl, link_shortcut_url: linkUrl }
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

  const section = page.getByRole('region', { name: 'iPhone Shortcuts' });
  const photos = section.getByRole('region', { name: 'From the Photos app' });
  await expect(photos.getByRole('link', { name: 'Add to Shortcuts' })).toHaveAttribute('href', LINK);
  // The build steps stay, folded away as the fallback.
  await expect(photos.getByText('Build the Shortcut yourself instead')).toBeVisible();
  // Only the admin can set the links.
  await expect(section.getByRole('form')).toHaveCount(0);
  // The Safari one is not shared yet: its build steps, no button.
  const safari = section.getByRole('region', { name: 'From Safari' });
  await expect(safari.getByRole('link', { name: 'Add to Shortcuts' })).toHaveCount(0);
  await expect(safari.getByText('How to set up the Shortcut')).toBeVisible();
});

test('without a shared link there is no button, only the build steps', async ({ page }) => {
  await installMockBackend(page, { email: 'cook@example.com' });
  await serveSettingsRow(page, null);
  await page.goto('/');
  await page.getByTitle('Settings').click();
  const section = page.getByRole('region', { name: 'iPhone Shortcuts' });
  await expect(section.getByText('How to set up the Shortcut')).toHaveCount(3);
  await expect(section.getByRole('link', { name: 'Add to Shortcuts' })).toHaveCount(0);
});

test('the admin pastes the iCloud link: saved at once, whatever came with it', async ({ page }) => {
  await installMockBackend(page);
  await serveSettingsRow(page, null);
  const posted: unknown[] = [];
  await page.route('**/api/account?action=shortcut-url', (route) => {
    const body = route.request().postDataJSON() as { url: string };
    posted.push(body);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: body.url }) });
  });
  await page.goto('/');
  await page.getByTitle('Settings').click();

  // Text without a link: said so on the spot, nothing sent.
  const form = page.getByRole('form', { name: 'Shared Shortcut link', exact: true });
  await form.getByRole('textbox').fill('https://example.com/not-a-shortcut');
  await form.getByRole('button', { name: 'Save link' }).click();
  await expect(form.getByRole('alert')).toContainText('No iCloud link found');

  // The link: saved as soon as it is pasted, no button needed.
  await form.getByRole('textbox').fill(LINK);
  await expect(form.getByRole('status')).toContainText('Saved');
  const photos = page.getByRole('region', { name: 'From the Photos app' });
  await expect(photos.getByRole('link', { name: 'Add to Shortcuts' })).toHaveAttribute('href', LINK);

  // The Safari Shortcut's link is its own; pasted with the Shortcut's name in
  // front, which a browser "url" field on an iPhone refused without a word.
  const SAFARI_LINK = 'https://www.icloud.com/shortcuts/0a1b2c3d4e5f60718293a4b5c6d7e8f9';
  const safariForm = page.getByRole('form', { name: 'Shared Safari Shortcut link' });
  await safariForm.getByRole('textbox').fill(`Save page to Speisekammer ${SAFARI_LINK}`);
  await expect(page.getByRole('region', { name: 'From Safari' }).getByRole('link', { name: 'Add to Shortcuts' })).toHaveAttribute('href', SAFARI_LINK);
  await expect(safariForm.getByRole('textbox')).toHaveValue(SAFARI_LINK);

  expect(posted).toEqual([
    { url: LINK, kind: 'photos' },
    { url: SAFARI_LINK, kind: 'safari' },
  ]);

  // And it can be taken back.
  await safariForm.getByRole('button', { name: 'Remove link' }).click();
  await expect.poll(() => posted.at(-1)).toEqual({ url: '', kind: 'safari' });
});

test('the Safari Shortcut: its button, the one setting it needs, and the script to paste', async ({ page }) => {
  const SAFARI_LINK = 'https://www.icloud.com/shortcuts/0a1b2c3d4e5f60718293a4b5c6d7e8f9';
  await installMockBackend(page, { email: 'cook@example.com' });
  await serveSettingsRow(page, null, SAFARI_LINK);
  await page.goto('/');
  await page.getByTitle('Settings').click();

  const safari = page.getByRole('region', { name: 'From Safari' });
  await expect(safari.getByRole('link', { name: 'Add to Shortcuts' })).toHaveAttribute('href', SAFARI_LINK);
  await expect(safari).toContainText('Allow Running Scripts');
  await safari.getByText('Build the Shortcut yourself instead').click();
  await expect(safari.getByTestId('safari-script')).toHaveText(SAFARI_SHORTCUT_SCRIPT);
  await expect(safari.getByRole('button', { name: 'Copy script' })).toBeVisible();
});

test('the link Shortcut, for Instagram: its button and what it sends', async ({ page }) => {
  const LINK_LINK = 'https://www.icloud.com/shortcuts/9f8e7d6c5b4a39281706f5e4d3c2b1a0';
  await installMockBackend(page, { email: 'cook@example.com' });
  await serveSettingsRow(page, null, null, LINK_LINK);
  await page.goto('/');
  await page.getByTitle('Settings').click();

  const section = page.getByRole('region', { name: 'iPhone Shortcuts' });
  await expect(section).toContainText('Three Shortcuts');
  const link = section.getByRole('region', { name: 'From Instagram and other apps' });
  await expect(link.getByRole('link', { name: 'Add to Shortcuts' })).toHaveAttribute('href', LINK_LINK);
  await expect(link).toContainText('read from the post');
  await expect(link).toContainText('Save page to Speisekammer');
  await link.getByText('Build the Shortcut yourself instead').click();
  await expect(link).toContainText('Send link to Speisekammer');
  await expect(link.getByText(/\/api\/extract\?via=shortcut$/)).toBeVisible();
  await expect(link.locator('ol')).toContainText('url = Shortcut Input');
  // The other two are not shared here: no button on either.
  await expect(section.getByRole('link', { name: 'Add to Shortcuts' })).toHaveCount(1);
});

test('the Safari script, run in a real browser, sends the recipe data and the address', async ({ page }) => {
  await page.route('https://recipes.example/kuerbissuppe', (route) => route.fulfill({
    status: 200, contentType: 'text/html; charset=utf-8',
    body: `<html lang="de"><head><title>Kürbissuppe</title><style>body{color:red}</style>
      <script>window.tracking = 1;</script>
      <script type="application/ld+json">{"@type":"Recipe","name":"Kürbissuppe","recipeIngredient":["1 Hokkaido"]}</script>
      </head><body style="margin:0"><h1>Kürbissuppe</h1><p>1 Hokkaido</p></body></html>`,
  }));
  await page.goto('https://recipes.example/kuerbissuppe');
  const sent = await page.evaluate((script) => new Promise<string>((resolve) => {
    new Function('completion', script)(resolve);
  }), SAFARI_SHORTCUT_SCRIPT);
  const { url, html } = JSON.parse(sent) as { url: string; html: string };
  expect(url).toBe('https://recipes.example/kuerbissuppe');
  expect(html).toContain('"@type":"Recipe"');
  expect(html).toContain('<h1>Kürbissuppe</h1>');
  expect(html).not.toContain('window.tracking');
  expect(html).not.toContain('color:red');
  expect(html).not.toContain('margin:0');
});
