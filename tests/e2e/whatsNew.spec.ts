import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installMockBackend } from './support/mockBackend';

/**
 * Pretend the reader last saw an ancient release, so the notes count as unread.
 *
 * Only seeds when unset: addInitScript runs on every navigation, so writing
 * unconditionally would restore the stale value after a reload and defeat the
 * persistence assertion below.
 */
async function asReturningReader(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('changelog-seen')) {
      window.localStorage.setItem('changelog-seen', '2000-01-01');
    }
  });
}

test('a returning reader sees a badge and can read what changed', async ({ page }) => {
  await installMockBackend(page);
  await asReturningReader(page);
  await page.goto('/');

  await page.getByRole('button', { name: /account menu, new updates available/i }).click();
  const entry = page.getByRole('button', { name: /what's new/i });
  await expect(entry).toBeVisible();
  await entry.click();

  const dialog = page.getByRole('dialog', { name: /what's new/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/updates? since your last visit/i)).toBeVisible();

  const violations = (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(violations.map((v) => v.id)).toEqual([]);

  await dialog.getByRole('button', { name: /got it/i }).click();
  await expect(dialog).toBeHidden();

  // The acknowledgement sticks across a reload: the badge does not come back.
  await page.reload();
  await expect(page.getByRole('button', { name: /^account menu$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /new updates available/i })).toHaveCount(0);
});

test('someone up to date gets no badge but can still open the notes', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: /^account menu$/i })).toBeVisible();
  await page.getByRole('button', { name: /^account menu$/i }).click();
  await page.getByRole('button', { name: /what's new/i }).click();
  await expect(page.getByRole('dialog', { name: /what's new/i })).toBeVisible();
});
