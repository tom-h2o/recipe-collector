import { test, expect } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * The three-dot menu used to be `absolute right-0` inside the recipe drawer.
 * The drawer scrolls, so it is `overflow-y: auto`, and CSS then computes
 * `overflow-x: auto` as well — making it a clipping box. On a narrow phone
 * `flex-wrap` pushes the button to the start of a second row, and the menu
 * went off the left edge: measured at 320px, 53% of it was clipped away and
 * the labels read "olic link" and "te tags".
 */
const SIZES = [
  { name: 'iphone-se', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'short-phone', width: 390, height: 640 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

for (const vp of SIZES) {
  test(`the options menu stays on screen (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await installMockBackend(page);
    await page.goto('/');
    await page.getByText('Classic Margherita Pizza').click();
    await expect(page.getByRole('dialog').getByText('Prepare dough.', { exact: false })).toBeVisible();

    await page.getByRole('dialog').getByTitle('More options').click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    const probe = await page.evaluate(() => {
      const el = document.querySelector('[role="menu"]') as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();

      // Intersect with every clipping ancestor, exactly as the browser does.
      let clip = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
      let n: HTMLElement | null = el.parentElement;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
          const cr = n.getBoundingClientRect();
          clip = {
            top: Math.max(clip.top, cr.top), left: Math.max(clip.left, cr.left),
            right: Math.min(clip.right, cr.right), bottom: Math.min(clip.bottom, cr.bottom),
          };
        }
        n = n.parentElement;
      }
      const vw = Math.max(0, Math.min(r.right, clip.right) - Math.max(r.left, clip.left));
      const vh = Math.max(0, Math.min(r.bottom, clip.bottom) - Math.max(r.top, clip.top));
      return {
        percentVisible: Math.round((vw * vh) / (r.width * r.height) * 100),
        offLeft: Math.round(Math.max(0, -r.left)),
        offRight: Math.round(Math.max(0, r.right - window.innerWidth)),
        offTop: Math.round(Math.max(0, -r.top)),
        offBottom: Math.round(Math.max(0, r.bottom - window.innerHeight)),
      };
    });

    expect(probe, 'the menu should be in the DOM').not.toBeNull();
    // Fully visible: no clipping ancestor eats any of it, and no edge of the
    // viewport cuts it off.
    expect(probe!.percentVisible).toBe(100);
    expect(probe!.offLeft).toBe(0);
    expect(probe!.offRight).toBe(0);
    expect(probe!.offTop).toBe(0);
    expect(probe!.offBottom).toBe(0);
  });
}

test('the options menu closes on Escape', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByText('Classic Margherita Pizza').click();
  await page.getByRole('dialog').getByTitle('More options').click();
  await expect(page.getByRole('menu')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});
