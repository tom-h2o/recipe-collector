import { test, expect } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * On a phone the recipes are one column, and scrolling down it should be
 * obvious where one recipe ends and the next begins. Cards used to have no
 * edge and no shadow until hovered — which a phone never is — so the pale card
 * footer met the pale page and the next photo began 16px further down.
 */

const PHONE = { width: 390, height: 844 };

for (const theme of ['light', 'dark'] as const) {
  test(`recipe cards stand apart from each other on a phone (${theme})`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await installMockBackend(page, { theme });
    await page.goto('/');
    await expect(page.getByText('Avocado Toast')).toBeVisible();

    const cards = page.locator('[data-pressable="surface"]');
    await expect(cards).toHaveCount(2);
    const [first, second] = [(await cards.nth(0).boundingBox())!, (await cards.nth(1).boundingBox())!];
    // One column, with room between.
    expect(Math.abs(first.x - second.x)).toBeLessThan(1);
    expect(second.y - (first.y + first.height)).toBeGreaterThanOrEqual(24);

    // Each card has its own edge at rest: a 1px ring, and a shadow under it.
    const shadow = await cards.first().evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toMatch(/0px 0px 0px 1px/);
    expect(shadow.split(/,(?![^(]*\))/).length).toBeGreaterThanOrEqual(3);
  });
}
