import type { Page } from '@playwright/test';

/**
 * Settings, light/dark and the admin dashboard are entries of the account
 * list: the avatar top right on a computer, the bottom bar's last tab ("You")
 * on a phone. Only the one that is on screen is in the accessibility tree, so
 * the same steps work at every width.
 */
export async function openAccount(page: Page) {
  await page.getByRole('button', { name: /^Account menu/ }).click();
}

export async function openSettings(page: Page) {
  await openAccount(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}

export async function openAdmin(page: Page) {
  await openAccount(page);
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
}
