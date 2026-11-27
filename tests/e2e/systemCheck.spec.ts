import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';
import { openAdmin } from './support/nav';

/**
 * The admin System tab. Configuration and reasoning load with the tab and call
 * nothing outside the app; the live checks cost real Gemini and Unsplash calls,
 * so they run only when "Run check" is pressed.
 */

const OVERVIEW = {
  expected_schema: '0067',
  config: [
    { id: 'gemini-key', label: 'Gemini API key', status: 'ok', detail: 'Set (GEMINI_API_KEY_1).' },
    { id: 'unsplash-key', label: 'Unsplash key', status: 'warn', detail: 'UNSPLASH_ACCESS_KEY is not set. Image search is off.' },
  ],
  reasoning: {
    since: '2026-11-14T00:00:00Z',
    usage_available: true,
    tasks: [
      { task: 'extract', reasoning: 'on', model: 'gemini-4-hydrogen', usage: [{ model: 'gemini-4-hydrogen', on: 4, off: 0, minimal: 0, low: 0, refused: 0, unrecorded: 0 }] },
      { task: 'translate', reasoning: 'off', model: 'gemini-4-hydrogen', usage: [
        { model: 'gemini-4-argon', on: 0, off: 0, minimal: 0, low: 0, refused: 1, unrecorded: 0 },
        { model: 'gemini-4-hydrogen', on: 0, off: 0, minimal: 0, low: 12, refused: 0, unrecorded: 0 },
      ] },
      { task: 'tag', reasoning: 'off', model: 'gemini-3.5-flash-lite', usage: [] },
    ],
  },
};

const LIVE = {
  checked_at: '2026-11-21T10:00:00Z',
  services: [
    { id: 'database', label: 'Database', status: 'ok', detail: 'Reachable. 2 recipes.', latency_ms: 40 },
    { id: 'schema', label: 'Database schema', status: 'ok', detail: 'At migration 0067, as this code expects.' },
    { id: 'unsplash', label: 'Image search (Unsplash)', status: 'skipped', detail: 'No key is set, so image search is off.' },
  ],
  models: [
    { model: 'gemini-3.5-flash-lite', kind: 'chat', status: 'ok', detail: 'Answers at the lowest reasoning level, minimal.', latency_ms: 800, model_version: 'gemini-3.5-flash-lite-001', reasoning: 'minimal' },
    { model: 'gemini-4-carbon', kind: 'chat', status: 'warn', detail: 'Quota used up (429). On a free-tier key a model may have no allowance at all and need billing.', latency_ms: 300, model_version: null, reasoning: 'unknown' },
    { model: 'gemini-embedding-2', kind: 'embedding', status: 'ok', detail: 'Answers with 768 values, as recipe search needs.', latency_ms: 200, model_version: null, reasoning: 'n/a' },
  ],
};

async function openSystemTab(page: Page, viewport = { width: 1280, height: 900 }) {
  await page.setViewportSize(viewport);
  await installMockBackend(page);
  const posts: string[] = [];
  await page.route((url) => url.pathname === '/api/account' && url.searchParams.get('tab') === 'health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERVIEW) }));
  await page.route((url) => url.pathname === '/api/account' && url.searchParams.get('action') === 'health-check', (route) => {
    posts.push(route.request().method());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIVE) });
  });
  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza')).toBeVisible();
  await openAdmin(page);
  await page.getByRole('tab', { name: 'System' }).click();
  return { posts };
}

test('opening the System tab calls no outside service', async ({ page }) => {
  const { posts } = await openSystemTab(page);
  const reasoning = page.getByRole('region', { name: 'Reasoning per task' });
  await expect(reasoning.locator('tr[data-task="translate"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Services' })).toContainText('Not checked yet');
  expect(posts).toEqual([]);
});

test('shows which tasks run without reasoning, and where a model refused', async ({ page }) => {
  await openSystemTab(page);
  const reasoning = page.getByRole('region', { name: 'Reasoning per task' });
  const translate = reasoning.locator('tr[data-task="translate"]');
  await expect(translate).toContainText('Translation');
  await expect(translate.getByText('lowest', { exact: true })).toBeVisible();
  await expect(translate).toContainText('12 low');
  await expect(translate).toContainText('1 refused');
  await expect(reasoning.locator('tr[data-task="extract"]').getByText('default', { exact: true })).toBeVisible();
  await expect(reasoning.locator('tr[data-task="tag"]')).toContainText('No calls');
  await expect(page.getByRole('region', { name: 'Configuration' })).toContainText('Image search is off');
});

test('"Run check" runs the live checks once and shows every model', async ({ page }) => {
  const { posts } = await openSystemTab(page);
  await page.getByRole('button', { name: 'Run check' }).click();
  const models = page.getByRole('region', { name: 'AI models' });
  await expect(models).toContainText('Lite');
  await expect(models).toContainText('Lowest reasoning: minimal');
  await expect(models).toContainText('Answered as gemini-3.5-flash-lite-001');
  await expect(models).toContainText('Frontier');
  await expect(models).toContainText('Quota used up');
  await expect(models).toContainText('Recipe search');
  await expect(page.getByRole('region', { name: 'Services' })).toContainText('At migration 0067');
  expect(posts).toEqual(['POST']);
});

test('the AI logs show whether each call reasoned', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMockBackend(page);
  await page.route((url) => url.pathname === '/api/account' && url.searchParams.get('tab') === 'logs', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 2, logs: [
      { id: '1', created_at: '2026-11-21T09:00:00Z', endpoint: 'translate', model: 'gemini-4-argon', model_version: null, status: 'success', latency_ms: 900, user_id: null, user_email: null, thinking: 'refused' },
      { id: '2', created_at: '2026-11-21T08:00:00Z', endpoint: 'tag', model: 'gemini-4-hydrogen', model_version: null, status: 'success', latency_ms: 500, user_id: null, user_email: null, thinking: 'off' },
    ] }) }));
  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza')).toBeVisible();
  await openAdmin(page);
  await page.getByRole('tab', { name: /AI Logs/ }).click();
  await expect(page.getByRole('columnheader', { name: 'Reasoning' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'gemini-4-argon' }).getByText('refused', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'tag' }).getByText('off', { exact: true })).toBeVisible();
});

test('on a phone, the System tab is reachable and the page does not run wider than the screen', async ({ page }) => {
  await openSystemTab(page, { width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Reasoning per task' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
