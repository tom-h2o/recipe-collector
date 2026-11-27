import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * The header on a phone: the name and five round buttons (Suggest, theme,
 * Settings, Add recipe, the account menu) in the 328 px a 360 px screen
 * leaves inside the page margins. It was 18 px too wide, which pushed every
 * view 2 px past the screen, so the whole app could be dragged sideways.
 *
 * Checked against the header's content box, not only the page's scroll
 * width: at 375 px the buttons already ran 3 px into the right margin while
 * the page itself still fitted.
 *
 * On a phone the admin's header is the same as everyone's (their extra tab is
 * in the bottom bar); both are checked so that an admin-only control added
 * later cannot break it unnoticed.
 */

const CONTROLS: (string | RegExp)[] = [
  // "Suggest a recipe" (its title) on a phone, "Suggest" (its label) from sm.
  /^Suggest/,
  /^Switch to (dark|light) mode$/,
  'Settings',
  'Add recipe',
  /^Account menu/,
];

async function open(page: Page, width: number, email?: string) {
  await page.setViewportSize({ width, height: 780 });
  await installMockBackend(page, email ? { email } : {});
  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza')).toBeVisible();
  // Newsreader is what the name is measured in; a fallback serif is narrower.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Every header control in full, inside the margins the page content uses. */
async function expectHeaderFits(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);

  const header = page.locator('header');
  const { left, right } = await header.locator(':scope > div').evaluate((row) => {
    const box = row.getBoundingClientRect();
    const style = getComputedStyle(row);
    return { left: box.left + parseFloat(style.paddingLeft), right: box.right - parseFloat(style.paddingRight) };
  });

  let lastRight = 0;
  for (const name of CONTROLS) {
    const control = header.getByRole('button', { name });
    await expect(control).toBeVisible();
    const box = (await control.boundingBox())!;
    // 36 px is what they are today; none may shrink to make room.
    expect(box.width, `${name} is narrower than 36 px`).toBeGreaterThanOrEqual(36);
    expect(box.height, `${name} is shorter than 36 px`).toBeGreaterThanOrEqual(36);
    expect(box.x, `${name} starts in the left margin`).toBeGreaterThanOrEqual(left - 0.5);
    expect(box.x + box.width, `${name} runs into the right margin`).toBeLessThanOrEqual(right + 0.5);
    lastRight = Math.max(lastRight, box.x + box.width);
  }
  // Flush with the margin, as the logo is on the left. The hidden desktop tabs
  // once left an empty grid column whose gap held the buttons 8 px short.
  expect(lastRight).toBeCloseTo(right, 0);
}

for (const who of [
  { name: 'the admin', email: undefined },
  { name: 'everyone else', email: 'cook@example.com' },
]) {
  test(`at 360 px the header fits, for ${who.name}`, async ({ page }) => {
    await open(page, 360, who.email);
    const adminTab = page.getByRole('navigation').getByRole('button', { name: 'Admin' });
    // Wait for the server's answer, so the header is in its final state.
    if (who.email) await expect(adminTab).toHaveCount(0);
    else await expect(adminTab).toBeVisible();

    await expectHeaderFits(page);
    // The name is shown in full, not cut short.
    const name = page.locator('header h1');
    await expect(name).toHaveText('Speisekammer');
    expect(await name.evaluate((h) => h.scrollWidth <= h.clientWidth)).toBe(true);
  });
}

test('at 360 px the header fits on the admin dashboard too', async ({ page }) => {
  await open(page, 360);
  await page.getByRole('navigation').getByRole('button', { name: 'Admin' }).click();
  await expect(page.getByText('Admin Dashboard')).toBeVisible();
  await expectHeaderFits(page);
});

test('at 320 px (Display Zoom) the name is cut short, not the page', async ({ page }) => {
  await open(page, 320);
  await expectHeaderFits(page);
  await expect(page.locator('header h1')).toBeVisible();
});

test('from 640 px the buttons line up with the right margin', async ({ page }) => {
  await open(page, 768);
  await expectHeaderFits(page);
});
