import { test, expect, type Page } from '@playwright/test';
import { installMockBackend, MOCK_USER } from './support/mockBackend';
import { openAccount } from './support/nav';

/**
 * "First steps": what a newly invited person is told once. It opens by itself
 * over an empty vault, never over a vault with recipes in it, and can always
 * be opened from the account list. Its buttons lead to the things it
 * describes.
 */
async function emptyVault(page: Page) {
  await page.route('**/rest/v1/recipes?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

const guide = (page: Page) => page.getByRole('dialog', { name: 'First steps' });

test('opens by itself for someone whose vault is empty, once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockBackend(page, { newPerson: true });
  await emptyVault(page);
  await page.goto('/');

  await expect(guide(page)).toBeVisible();
  for (const title of ['Put the app on your Home Screen', 'Add your first recipe', 'Send recipes straight from your iPhone', 'Cook, plan and shop']) {
    await expect(guide(page).getByRole('heading', { name: title })).toBeVisible();
  }
  // In a browser tab: how to get it onto the Home Screen.
  await expect(guide(page)).toContainText('Add to Home Screen');
  // It fits a phone: nothing runs off the side.
  expect(await guide(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);

  await guide(page).getByRole('button', { name: 'Got it' }).click();
  await expect(guide(page)).toHaveCount(0);

  // Not again on the next visit.
  await page.reload();
  await expect(page.getByText(/vault is empty/i)).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
});

test('does not open over a vault that has recipes', async ({ page }) => {
  await installMockBackend(page, { newPerson: true });
  await page.goto('/');
  await expect(page.locator('.recipe-card').first()).toBeVisible();
  await page.waitForTimeout(600);
  await expect(guide(page)).toHaveCount(0);
  // And it has not been used up: the marker is only written when it is shown.
  expect(await page.evaluate((id) => localStorage.getItem(`sk-first-steps-seen:${id}`), MOCK_USER.id)).toBeNull();
});

test('does not open because a search found nothing', async ({ page }) => {
  await installMockBackend(page, { newPerson: true });
  await page.goto('/');
  await expect(page.locator('.recipe-card').first()).toBeVisible();
  await emptyVault(page);
  await page.getByPlaceholder(/Search/).fill('zzzz');
  await expect(page.getByText('No results found')).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`is always under the account list, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await installMockBackend(page);
    await page.goto('/');
    await expect(page.locator('.recipe-card').first()).toBeVisible();
    await openAccount(page);
    await page.getByRole('button', { name: 'First steps', exact: true }).click();
    await expect(guide(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(guide(page)).toHaveCount(0);
  });
}

test('its buttons open the add form and the Shortcut settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockBackend(page, { newPerson: true });
  await emptyVault(page);
  await page.goto('/');

  await guide(page).getByRole('button', { name: 'Add a recipe' }).click();
  await expect(guide(page)).toHaveCount(0);
  const form = page.getByRole('dialog').filter({ hasText: 'Enter it manually' });
  await expect(form).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);

  await openAccount(page);
  await page.getByRole('button', { name: 'First steps', exact: true }).click();
  await guide(page).getByRole('button', { name: 'Open the Shortcut settings' }).click();
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByText('iPhone Shortcuts').first()).toBeVisible();
});

test('says the Home Screen step is done when opened from there', async ({ page }) => {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => (query.includes('display-mode: standalone')
      ? { ...real(query), matches: true, media: query } as MediaQueryList
      : real(query));
  });
  await installMockBackend(page, { newPerson: true });
  await emptyVault(page);
  await page.goto('/');
  await expect(guide(page)).toContainText('Done: you opened it from there.');
  await expect(guide(page).getByText('Add to Home Screen')).toHaveCount(0);
});

test.describe('in German', () => {
  test.use({ locale: 'de-DE' });
  test('the guide is in German and fits a 360 px phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await installMockBackend(page, { newPerson: true });
    await emptyVault(page);
    await page.goto('/');
    const sheet = page.getByRole('dialog', { name: 'Erste Schritte' });
    await expect(sheet.getByRole('heading', { name: 'Leg die App auf deinen Home-Bildschirm' })).toBeVisible();
    await expect(sheet).toContainText('Zum Home-Bildschirm');
    expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
    await expect(sheet.getByRole('button', { name: 'Alles klar' })).toBeVisible();
  });
});
