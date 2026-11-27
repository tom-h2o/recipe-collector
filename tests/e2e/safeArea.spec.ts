import { test, expect, type Locator, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * index.html asks for `viewport-fit=cover`, so on an iPhone the page runs up
 * under the status bar (clock, Dynamic Island) and down under the home
 * indicator. Taps in those strips go to the system, not to the page: a button
 * drawn there is visible, looks blurred behind the status bar, and does
 * nothing. That is how the header looked on a real iPhone.
 *
 * Chromium can be given an iPhone's insets, which makes `env(safe-area-inset-*)`
 * report them. These tests do that and check that nothing a person has to tap
 * sits inside either strip.
 */

const PHONE = { width: 393, height: 852 }; // iPhone 15 / 16
const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };
const LANDSCAPE = { width: 852, height: 393 };
const LANDSCAPE_INSETS = { top: 0, bottom: 21, left: 59, right: 59 };

async function giveInsets(page: Page, insets: typeof INSETS) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: {
      top: insets.top, topMax: insets.top,
      bottom: insets.bottom, bottomMax: insets.bottom,
      left: insets.left, leftMax: insets.left,
      right: insets.right, rightMax: insets.right,
    },
  });
}

async function openVault(page: Page, viewport = PHONE, insets = INSETS) {
  await page.setViewportSize(viewport);
  await giveInsets(page, insets);
  await installMockBackend(page);
  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza')).toBeVisible();
}

async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));
}

/** The control lies wholly between the status bar and the home indicator. */
async function expectTappable(control: Locator, viewport = PHONE, insets = INSETS) {
  await expect(control).toBeVisible();
  const box = (await control.boundingBox())!;
  const name = (await control.getAttribute('aria-label')) ?? (await control.textContent())?.trim() ?? '';
  expect(box.y, `"${name}" starts under the status bar`).toBeGreaterThanOrEqual(insets.top);
  expect(box.y + box.height, `"${name}" ends under the home indicator`).toBeLessThanOrEqual(viewport.height - insets.bottom);
  expect(box.x, `"${name}" starts under the notch`).toBeGreaterThanOrEqual(insets.left);
  expect(box.x + box.width, `"${name}" ends under the notch`).toBeLessThanOrEqual(viewport.width - insets.right);
}

test.describe('on an iPhone, nothing to tap sits under the status bar or the home indicator', () => {
  test('the header: its glass runs up behind the status bar, its buttons start below it', async ({ page }) => {
    await openVault(page);
    const header = page.locator('header');

    // The bar itself reaches the top edge, so the status bar shows the bar
    // rather than recipes scrolling past behind the clock.
    expect((await header.boundingBox())!.y).toBe(0);
    const buttons = header.getByRole('button');
    // Suggest and Add recipe: the rest moved into the account sheet.
    expect(await buttons.count()).toBe(2);
    for (const button of await buttons.all()) await expectTappable(button);

    // Still true once the page has scrolled and the bar is stuck to the top.
    await page.mouse.wheel(0, 700);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    expect((await header.boundingBox())!.y).toBe(0);
    for (const button of await buttons.all()) await expectTappable(button);
  });

  test('the account sheet: every entry lies above the home indicator', async ({ page }) => {
    await openVault(page);
    await page.getByRole('button', { name: /^Account menu/ }).click();
    const sheet = page.getByRole('dialog', { name: 'You' });
    await expect(sheet).toBeVisible();
    await settle(page);
    // The sheet itself runs to the bottom edge; what can be tapped does not.
    const box = (await sheet.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(PHONE.height);
    for (const entry of await sheet.getByRole('button').all()) await expectTappable(entry);
    await expectTappable(sheet.getByRole('switch', { name: 'Dark mode' }));
  });

  test('the tab bar floats above the home indicator', async ({ page }) => {
    await openVault(page);
    for (const tab of await page.getByRole('navigation').getByRole('button').all()) await expectTappable(tab);
  });

  test('an open recipe can be closed, and its actions reached', async ({ page }) => {
    await openVault(page);
    await page.getByText('Avocado Toast').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await settle(page);

    await expectTappable(dialog.getByRole('button', { name: 'Close', exact: true }));
    await expectTappable(dialog.getByRole('button', { name: 'Cook', exact: true }));
    await expectTappable(dialog);
  });

  test('cook mode can be left, stepped through, and its ingredients closed', async ({ page }) => {
    await openVault(page);
    await page.getByText('Classic Margherita Pizza').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cook', exact: true }).click();
    const exit = page.getByRole('button', { name: 'Exit cook mode' });
    await expect(exit).toBeVisible();
    await settle(page);

    await expectTappable(exit);
    // One step reads "Done!", more read "Next →": either way the button at the foot.
    await expectTappable(page.getByRole('button', { name: /Next|Done/ }));

    await page.getByRole('button', { name: 'Show ingredients' }).click();
    await expectTappable(page.getByRole('button', { name: 'Hide ingredients' }).first());
  });

  test('a notice appears below the status bar, not behind it', async ({ page }) => {
    await openVault(page);
    await page.getByText('Avocado Toast').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Add to meal plan' }).click();
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    const toast = page.locator('[data-sonner-toast]').first();
    await expect(toast).toBeVisible();
    await settle(page);
    await expectTappable(toast);
  });

  test('the sign-in screen: the theme switch is reachable', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await giveInsets(page, INSETS);
    await page.goto('/');
    await expectTappable(page.getByRole('button', { name: 'Toggle dark mode' }));
  });

  test('turned sideways, the header keeps clear of the notch', async ({ page }) => {
    await openVault(page, LANDSCAPE, LANDSCAPE_INSETS);
    for (const button of await page.locator('header').getByRole('button').all()) {
      await expectTappable(button, LANDSCAPE, LANDSCAPE_INSETS);
    }
    await expectTappable(page.locator('header h1'), LANDSCAPE, LANDSCAPE_INSETS);

    // The recipes too: their left and right edges, not their height, which
    // runs on down the page.
    for (const card of await page.locator('[data-pressable="surface"]').all()) {
      const box = (await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(LANDSCAPE_INSETS.left);
      expect(box.x + box.width).toBeLessThanOrEqual(LANDSCAPE.width - LANDSCAPE_INSETS.right);
    }
  });
});
