import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installMockBackend } from './support/mockBackend';

/**
 * Accessibility audit. Fails on any serious or critical WCAG 2.1 A/AA violation.
 *
 * The authenticated screens are reached with a mocked Supabase session rather
 * than a real account (see support/mockBackend), so this needs no credentials
 * and no seeded test user.
 */

async function auditSerious(page: Page, context?: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => {
      const where = v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ');
      return `${v.id} (${v.impact}) x${v.nodes.length}${context ? ` [${context}]` : ''}: ${v.help} → ${where}`;
    });
}

for (const theme of ['light', 'dark'] as const) {
  test(`login screen (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => window.localStorage.setItem('theme', t), theme);
    await page.goto('/');
    await page.waitForSelector('h1');
    expect(await auditSerious(page, theme)).toEqual([]);
  });

  test(`recipe vault (${theme})`, async ({ page }) => {
    await installMockBackend(page, { theme });
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByText('Classic Margherita Pizza')).toBeVisible();
    expect(await auditSerious(page, theme)).toEqual([]);
  });
}

test('recipe detail drawer', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByText('Classic Margherita Pizza').click();
  // the drawer renders the instructions, which the card does not
  await expect(page.getByText('Prepare dough.', { exact: false })).toBeVisible();
  expect(await auditSerious(page, 'recipe detail')).toEqual([]);
});

test('add recipe dialog', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByRole('button', { name: /add recipe/i }).click();
  await expect(page.getByText('Add New Recipe')).toBeVisible();
  expect(await auditSerious(page, 'add recipe')).toEqual([]);
});

test('settings dialog', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByTitle('Settings').click();
  await expect(page.getByText('Gemini Model')).toBeVisible();
  expect(await auditSerious(page, 'settings')).toEqual([]);
});
