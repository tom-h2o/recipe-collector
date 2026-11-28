import { test, expect } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';
import { openAccount } from './support/nav';

/**
 * The app speaks English and German (src/i18n). Which one: the choice in
 * Settings → General, kept on the device; until someone chooses, the device's
 * language. Every other spec runs in English (playwright.config.ts).
 */

test.describe('on a German device', () => {
  test.use({ locale: 'de-DE' });

  test('the app is German from the first screen, before signing in', async ({ page }) => {
    await installMockBackend(page, { signedIn: false });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByLabel('Passwort', { exact: true })).toBeVisible();
    await expect(page.getByText('Sign In', { exact: true })).toHaveCount(0);
  });

  test('the tabs keep Vault and Inbox, and the planner is the Plan', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await installMockBackend(page);
    await page.goto('/');
    const nav = page.getByRole('banner');
    await expect(nav.getByRole('button', { name: /Vault/ })).toBeVisible();
    await expect(nav.getByRole('button', { name: /^Plan/ })).toBeVisible();
    await expect(nav.getByRole('button', { name: /Einkauf/ })).toBeVisible();
    await expect(nav.getByRole('button', { name: /Inbox/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rezept hinzufügen' }).first()).toBeVisible();
  });

  test('a phone at 360 px still fits: no sideways scrolling in German', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await installMockBackend(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^Plan/ }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('Settings switches to English at once, and the choice survives a reload', async ({ page }) => {
    await installMockBackend(page);
    await page.goto('/');
    await page.getByRole('button', { name: /^Kontomenü/ }).click();
    await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();

    const language = page.getByRole('group', { name: 'Sprache' });
    await expect(language.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
    await language.getByRole('button', { name: 'English' }).click();

    // No Save, no reload: the open dialog is English now.
    await expect(page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('tab', { name: 'General' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'Add recipe' }).first()).toBeVisible();
  });
});

test('on an English device, Settings switches to German and back to the device', async ({ page }) => {
  await installMockBackend(page);
  await page.goto('/');
  await openAccount(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();

  await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Deutsch' }).click();
  await expect(page.getByRole('tab', { name: 'Allgemein' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sk-language'))).toBe('de');

  await page.getByRole('group', { name: 'Sprache' }).getByRole('button', { name: 'System' }).click();
  await expect(page.getByRole('tab', { name: 'General' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sk-language'))).toBeNull();
});
