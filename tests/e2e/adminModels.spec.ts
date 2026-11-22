import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * The AI models are the admin's choice, for everyone (migration 0068).
 *
 * Everyone else used to get the same selects as the admin, so anyone could put
 * every task on the Frontier tier, which has no free allowance: on a key
 * without billing each of their calls then failed. They now see which model
 * each task runs on, read from the shared settings row, and nothing to change.
 * The admin keeps the controls, and a change goes to the admin endpoint rather
 * than into their own settings row, which nothing reads models from any more.
 */

// As migration 0069 leaves the global row.
const GLOBAL = {
  gemini_model: 'claude-sonnet-5-5',
  task_models: {
    extract: 'claude-sonnet-5-5',
    photo: 'claude-opus-5-5',
    translate: 'claude-sonnet-5-5',
    suggest: 'claude-haiku-5-5',
    tag: 'claude-haiku-5-5',
    nutrition: 'claude-sonnet-5-5',
    scale: 'claude-haiku-5-5',
    shopping: 'claude-haiku-5-5',
  },
};

/** Serves the two settings rows and records what the app writes. */
async function serveSettings(page: Page) {
  const rowWrites: Record<string, unknown>[] = [];
  const modelPosts: unknown[] = [];

  // Registered after installMockBackend, so these win for the paths they match.
  await page.route('**/rest/v1/settings*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      const body = req.url().includes('id=eq.1') ? GLOBAL : { temperature_unit: 'C' };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    rowWrites.push(req.postDataJSON());
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/account?action=models', async (route) => {
    modelPosts.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: route.request().postData() ?? '{}' });
  });

  return { rowWrites, modelPosts };
}

test('everyone else sees the model per task, and nothing to change it with', async ({ page }) => {
  await installMockBackend(page, { email: 'cook@example.com' });
  await serveSettings(page);
  await page.goto('/');
  await page.getByTitle('Settings').click();

  const list = page.getByRole('list', { name: 'AI model per task' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('listitem').filter({ hasText: 'Translation' })).toContainText('Claude Sonnet');
  await expect(list.getByRole('listitem').filter({ hasText: 'Tagging' })).toContainText('Claude Haiku');
  await expect(list.getByRole('listitem')).toHaveCount(8);

  await expect(page.getByLabel('Main model')).toHaveCount(0);
  await expect(page.getByLabel(/^Model for /)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use recommended' })).toHaveCount(0);
  // A model nothing runs on is not mentioned at all.
  await expect(page.getByRole('dialog')).not.toContainText('gemini-4-carbon');
});

test('the admin changes a task\'s model for everyone through the admin endpoint', async ({ page }) => {
  await installMockBackend(page);
  const { rowWrites, modelPosts } = await serveSettings(page);
  await page.goto('/');
  await page.getByTitle('Settings').click();

  await expect(page.getByText('apply to everyone using the app')).toBeVisible();
  const tagging = page.getByLabel('Model for Tagging');
  await expect(tagging).toContainText('Claude Haiku');

  await tagging.click();
  await page.getByRole('option', { name: /^Claude Sonnet/ }).click();
  await expect(tagging).toContainText('Claude Sonnet');
  await page.getByRole('button', { name: 'Save Settings' }).click();

  await expect.poll(() => modelPosts.length).toBe(1);
  expect(modelPosts[0]).toEqual({
    gemini_model: GLOBAL.gemini_model,
    task_models: { ...GLOBAL.task_models, tag: 'claude-sonnet-5-5' },
  });
  // The admin's own row gets the unit only — no models.
  for (const write of rowWrites) {
    expect(Object.keys(write).sort()).toEqual(['temperature_unit', 'user_id']);
  }
});
