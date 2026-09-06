import { test, expect } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * The select trigger is a fixed-height, `whitespace-nowrap` box, and Base UI
 * renders the selected item's own children inside it by default. The model
 * options carry a name, a badge, an id, a description and a price, so all of
 * that was being crammed into the trigger and spilling out of it.
 *
 * Both selects now pass an explicit render function to SelectValue. This asserts
 * the outcome — no trigger's content exceeds its box — rather than the
 * implementation, so it stays true whichever way that is fixed.
 */
test('no settings dropdown overflows its trigger', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByTitle('Settings').click();
  await page.getByText('Gemini Model').waitFor();

  const overflowing = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('[data-slot="select-trigger"]').forEach((el) => {
      const t = el as HTMLElement;
      // +1 absorbs sub-pixel rounding.
      if (t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1) {
        out.push(
          `${t.getAttribute('aria-label') ?? '(unlabelled)'}: content ${t.scrollWidth}x${t.scrollHeight} exceeds box ${t.clientWidth}x${t.clientHeight}`,
        );
      }
    });
    return out;
  });

  expect(overflowing).toEqual([]);
});

test('the model trigger shows the tier, not the whole option block', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByTitle('Settings').click();

  const trigger = page.getByLabel('Gemini model');
  await expect(trigger).toContainText('Flash');
  // The description and price belong in the open list, never in the trigger.
  await expect(trigger).not.toContainText('per 1M tokens');
  await expect(trigger).not.toContainText('Best all-round choice');
});
