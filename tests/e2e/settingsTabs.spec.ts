import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * The tab bars in Settings and on the admin dashboard (SegmentedTabs). On a
 * phone Settings' three tabs were squeezed into equal thirds: "Usage Logs"
 * wrapped onto two lines and its icon sat beside "Connections". Now a label
 * never wraps, the AI models have a tab of their own (they made General as
 * long as twelve screens for the admin), and a bar too wide for the screen
 * scrolls rather than squeezing.
 */

/** Every tab: one line of text, nothing spilling out of its own box. */
async function tabsFit(page: Page, list: string) {
  return page.getByRole('tablist', { name: list }).evaluate((el) => {
    return Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]')).map((tab) => ({
      name: tab.textContent?.trim(),
      oneLine: tab.getBoundingClientRect().height <= 40,
      spills: tab.scrollWidth > tab.clientWidth + 1,
    }));
  });
}

for (const width of [375, 390]) {
  test(`Settings: four tabs on one row of a ${width} px phone, none squeezed`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await installMockBackend(page);
    await page.goto('/');
    await page.getByTitle('Settings').click();

    const tabs = page.getByRole('tablist', { name: 'Settings sections' });
    await expect(tabs.getByRole('tab')).toHaveCount(4);
    for (const t of await tabsFit(page, 'Settings sections')) {
      expect(t, t.name).toMatchObject({ oneLine: true, spills: false });
    }
    // The whole bar fits: nothing to scroll to at this width.
    expect(await tabs.evaluate((el) => el.scrollWidth <= (el.parentElement as HTMLElement).clientWidth + 1)).toBe(true);
    // "AI" on a phone, still named in full.
    expect(await tabs.getByRole('tab', { name: 'AI models' }).innerText()).toBe('AI');
  });
}

test('Settings: arrow keys move between tabs, and the pill follows', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByTitle('Settings').click();

  const general = page.getByRole('tab', { name: 'General' });
  await expect(general).toHaveAttribute('aria-selected', 'true');
  await general.focus();
  await page.keyboard.press('ArrowRight');
  const ai = page.getByRole('tab', { name: 'AI models' });
  await expect(ai).toHaveAttribute('aria-selected', 'true');
  await expect(ai).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('Main model');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Usage' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText("Today's AI usage");

  // Only the chosen tab is in the Tab order.
  await expect(page.getByRole('tablist', { name: 'Settings sections' }).locator('[tabindex="0"]')).toHaveCount(1);

  // The pill sits under the chosen tab once it has slid there.
  await page.waitForTimeout(600);
  const tab = (await page.getByRole('tab', { name: 'Usage' }).boundingBox())!;
  const pill = (await page.getByRole('tablist', { name: 'Settings sections' }).locator('.tab-pill').boundingBox())!;
  expect(Math.abs(pill.x - tab.x)).toBeLessThan(2);
  expect(Math.abs(pill.width - tab.width)).toBeLessThan(2);
});

test('Settings: the AI models have their own tab, with Save for the admin only', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByTitle('Settings').click();

  // General is the everyday things: no model pickers in it any more.
  await expect(page.getByRole('tabpanel')).toContainText('Temperature Unit');
  await expect(page.getByLabel('Main model')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save Settings' })).toBeVisible();

  await page.getByRole('tab', { name: 'AI models' }).click();
  await expect(page.getByLabel('Main model')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Settings' })).toBeVisible();

  await page.getByRole('tab', { name: 'Connections' }).click();
  await expect(page.getByRole('button', { name: 'Save Settings' })).toHaveCount(0);
});

test('Settings: anyone else reads the models, with nothing to save', async ({ page }) => {
  await installMockBackend(page, { email: 'cook@example.com' });
  await page.goto('/');
  await page.getByTitle('Settings').click();
  await page.getByRole('tab', { name: 'AI models' }).click();
  await expect(page.getByRole('list', { name: 'AI model per task' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Settings' })).toHaveCount(0);
});

test('Admin: the tabs scroll on a phone instead of squeezing, and the chosen one comes into view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockBackend(page);
  await page.route((url) => url.pathname === '/api/account' && url.searchParams.get('tab') === 'health', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ expected_schema: '0073', config: [], reasoning: { since: null, usage_available: true, tasks: [] } }),
  }));
  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Admin' }).click();

  const tabs = page.getByRole('tablist', { name: 'Admin sections' });
  // Overview, Usage, Feedback, Users, Recipes, AI Logs, System.
  await expect(tabs.getByRole('tab')).toHaveCount(7);
  for (const t of await tabsFit(page, 'Admin sections')) {
    expect(t, t.name).toMatchObject({ oneLine: true, spills: false });
  }

  const system = tabs.getByRole('tab', { name: 'System' });
  await system.click();
  await expect(system).toHaveAttribute('aria-selected', 'true');
  await expect(system).toBeInViewport({ ratio: 1 });
  // The page itself never scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
