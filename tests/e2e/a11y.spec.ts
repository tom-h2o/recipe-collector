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
  // Views and dialogs fade in. Measuring colour contrast mid-animation reads the
  // blended value, not the real one, which produces false failures and flake —
  // so wait for every running animation to finish first.
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((a) => a.finished.catch(() => undefined)),
    ).then(() => undefined),
  );

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

// ── remaining views ──────────────────────────────────────────────────────────

const VIEWS = [
  { tab: 'Meal Planner', settles: 'Breakfast' },
  { tab: 'Shopping', settles: 'Generate from Next 7 Days' },
  { tab: 'Inbox', settles: 'Your inbox is empty' },
  { tab: 'Admin', settles: 'Admin Dashboard' },
] as const;

for (const { tab, settles } of VIEWS) {
  test(`${tab.toLowerCase()} view`, async ({ page }) => {
    await installMockBackend(page);
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();

    // the nav is rendered twice (desktop + mobile); only one is visible
    await page.getByRole('button', { name: tab, exact: false }).filter({ visible: true }).first().click();
    // wait for content unique to the view, not for the nav label itself
    await expect(page.getByText(settles).first()).toBeVisible();

    expect(await auditSerious(page, tab.toLowerCase())).toEqual([]);
  });
}

test('cook mode', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByText('Classic Margherita Pizza').click();
  await page.getByTitle('Cook Mode').click();
  // cook mode shows a step counter that nothing else on the page renders
  await expect(page.getByText(/^1\/\d+$/)).toBeVisible();
  expect(await auditSerious(page, 'cook mode')).toEqual([]);
});

// ── keyboard behaviour ───────────────────────────────────────────────────────
// axe cannot judge these from a static snapshot, and dialog-heavy UIs fail here.

test('dialogs take focus, trap it, and return it on Escape', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');

  const trigger = page.getByRole('button', { name: /add recipe/i });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // focus must move into the dialog, not linger on the trigger behind it
  await expect
    .poll(() => dialog.evaluate((d) => d.contains(document.activeElement)))
    .toBe(true);

  // tabbing repeatedly must never escape the dialog
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const inside = await dialog.evaluate((d) => d.contains(document.activeElement));
    expect(inside, `focus left the dialog after ${i + 1} tabs`).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // and focus must come back to what opened it, not to the top of the page
  await expect.poll(() => trigger.evaluate((el) => el === document.activeElement)).toBe(true);
});

test('every interactive control on the vault is reachable by keyboard', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza')).toBeVisible();

  // nothing focusable should be removed from the tab order with a negative index
  const stranded = await page.evaluate(() =>
    [...document.querySelectorAll('button, a[href], input, select, textarea')]
      .filter((el) => {
        const e = el as HTMLElement;
        const visible = !!e.offsetParent && !e.hasAttribute('disabled');
        return visible && e.tabIndex < 0;
      })
      .map((el) => (el as HTMLElement).outerHTML.replace(/\s+/g, ' ').slice(0, 90)),
  );
  expect(stranded, 'these controls are visible but not keyboard reachable').toEqual([]);
});
