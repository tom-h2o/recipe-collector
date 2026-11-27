import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * Admin → Usage (migration 0075): the report admin_usage() returns, shown as
 * tiles, two weekly charts, the features used, the iPhone imports and a row
 * per person. The numbers come from the server; what is tested here is that
 * they reach the screen, that the period is asked for, and that the page
 * fits a phone.
 */

const WEEKS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'];

function report(days: number) {
  return {
    days,
    first_day: days === 7 ? '2026-11-21' : '2026-10-29',
    today: '2026-11-27',
    tracking_since: '2026-11-27',
    totals: { active_people: days === 7 ? 2 : 3, recipes_added: 14, ai_calls: 41, iphone_imports: 5, shares_sent: 2, connections_made: 1 },
    weeks: WEEKS.map((week_start, i) => ({ week_start, active_people: i < 5 ? 1 : 3, recipes_added: i * 2 })),
    features: [
      { endpoint: 'tag', calls: 14, people: 2, failed: 0 },
      { endpoint: 'translate', calls: 9, people: 2, failed: 1 },
      { endpoint: 'extract-photo', calls: 4, people: 1, failed: 0 },
    ],
    imports: [{ source: 'photos', count: 4, failed: 1 }, { source: 'page', count: 1, failed: 0 }],
    people: [
      { id: 'u1', email: 'cook@example.com', created_at: '2026-10-01T10:00:00Z', last_sign_in_at: '2026-11-26T08:00:00Z', last_active: '2026-11-27', active_days: 12, recipes_added: 9, recipes_total: 40, ai_calls: 30 },
      { id: 'u2', email: 'reader@example.com', created_at: '2026-11-20T10:00:00Z', last_sign_in_at: '2026-11-20T10:00:00Z', last_active: '2026-11-26', active_days: 3, recipes_added: 0, recipes_total: 0, ai_calls: 0 },
    ],
  };
}

async function openUsage(page: Page, viewport = { width: 1280, height: 900 }) {
  await page.setViewportSize(viewport);
  await installMockBackend(page);
  const asked: (string | null)[] = [];
  await page.route((url) => url.pathname === '/api/account' && url.searchParams.get('tab') === 'usage', (route) => {
    const days = new URL(route.request().url()).searchParams.get('days');
    asked.push(days);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: report(Number(days)) }) });
  });
  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza')).toBeVisible();
  const nav = viewport.width >= 1024 ? page.locator('header') : page.getByRole('navigation');
  await nav.getByRole('button', { name: 'Admin' }).click();
  await page.getByRole('tab', { name: 'Usage' }).click();
  return { asked };
}

test('shows who used the app and for what, over the last 30 days', async ({ page }) => {
  const { asked } = await openUsage(page);
  const panel = page.getByRole('tabpanel');

  await expect(panel.getByRole('paragraph').filter({ hasText: /^Active people$/ })).toBeVisible();
  await expect(panel.getByText('41', { exact: true })).toBeVisible();
  // Development's StrictMode runs the effect twice; either way, 30 days.
  expect(new Set(asked)).toEqual(new Set(['30']));

  // Two charts, eight weeks each, every column described for a screen reader.
  await expect(panel.getByRole('figure')).toHaveCount(2);
  await expect(panel.getByTestId('week-bar')).toHaveCount(16);
  await expect(panel.getByText('Week of 23 Nov: 3 people')).toBeAttached();
  await expect(panel.getByText('Week of 23 Nov: 14 recipes')).toBeAttached();

  // Features in words, not endpoint names, with failures said.
  await expect(panel.getByText('Tags, after saving')).toBeVisible();
  await expect(panel.getByText('9 times · 2 people · 1 failed')).toBeVisible();
  await expect(panel.getByText('Recipe from a photo')).toBeVisible();

  // A person who only reads still shows, with the days they opened the app.
  const reader = panel.getByRole('row', { name: /reader@example\.com/ });
  await expect(reader).toContainText('3');
  await expect(panel.getByText(/Opening the app counts from 27 Nov 2026/)).toBeVisible();
});

test('asks for the shorter period when it is chosen', async ({ page }) => {
  const { asked } = await openUsage(page);
  await page.getByRole('button', { name: 'Last 7 days' }).click();
  await expect(page.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => asked.at(-1)).toBe('7');
  await expect(page.getByText(/^Since 21 Nov 2026/)).toBeVisible();
});

test('says so, and offers a retry, when the report cannot be made', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installMockBackend(page);
  await page.route((url) => url.pathname === '/api/account' && url.searchParams.get('tab') === 'usage', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The usage report needs the latest database migration. Try again in a few minutes.' }) }));
  await page.goto('/');
  await page.locator('header').getByRole('button', { name: 'Admin' }).click();
  await page.getByRole('tab', { name: 'Usage' }).click();
  await expect(page.getByRole('alert')).toContainText('latest database migration');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

// 375, like the other phone checks (a11y.spec.ts). At 360 the page header is
// already 2px too wide, whichever tab is open.
test('fits a phone without scrolling sideways', async ({ page }) => {
  await openUsage(page, { width: 375, height: 812 });
  await expect(page.getByRole('figure').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
