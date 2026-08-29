import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility smoke test. Runs axe against the unauthenticated screens — the
 * only ones reachable without a session — in both colour themes.
 */
const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  test(`login screen has no serious accessibility violations (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => window.localStorage.setItem('theme', t), theme);
    await page.goto('/');
    await page.waitForSelector('h1');

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const summary = serious.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`);
    expect(summary, `axe found serious issues in ${theme} mode`).toEqual([]);
  });
}
