import { test, expect, type Page } from '@playwright/test';
import { installMockBackend, MOCK_USER } from './support/mockBackend';
import { openAccount } from './support/nav';

/**
 * The account list: on a phone the bottom bar's last tab ("You") opens it as
 * a sheet, on a computer the avatar top right opens it as a menu. It holds
 * what used to be spread over the top bar and the tab bars: Settings,
 * light/dark, the admin dashboard, and the rest of what is about the person.
 */
async function open(page: Page, width: number, options: { email?: string } = {}) {
  await page.setViewportSize({ width, height: 844 });
  await installMockBackend(page, options);
  await page.goto('/');
  await expect(page.locator('.recipe-card').first()).toBeVisible();
}

test('on a phone the last tab opens the account sheet, with every entry', async ({ page }) => {
  await open(page, 390);
  // Not in the top bar any more.
  await expect(page.locator('header').getByRole('button', { name: /^Account menu/ })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: /^Account menu/ }).click();

  const sheet = page.getByRole('dialog', { name: 'You' });
  await expect(sheet).toContainText(MOCK_USER.email);
  for (const name of ['Settings', 'Admin', "What's new", 'Send feedback', 'Export recipes', 'Change password', 'Sign out', 'Delete account']) {
    await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(sheet.getByRole('switch', { name: 'Dark mode' })).toBeVisible();
  // "Signed in with email" was drawn as a button and did nothing.
  await expect(sheet.getByText(/Signed in with/)).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('on a computer the avatar opens the same entries as a menu', async ({ page }) => {
  await open(page, 1280);
  await expect(page.getByRole('navigation').getByRole('button', { name: /^Account menu/ })).toHaveCount(0);
  await page.locator('header').getByRole('button', { name: /^Account menu/ }).click();
  for (const name of ['Settings', 'Admin', 'Send feedback', 'Export recipes', 'Sign out']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // Light/dark and Settings left the top bar.
  await expect(page.locator('header').getByRole('button', { name: 'Settings' })).toHaveCount(0);
});

test('Admin is offered to the admin only, and opens the dashboard', async ({ page }) => {
  await open(page, 390, { email: 'cook@example.com' });
  await openAccount(page);
  await expect(page.getByRole('dialog', { name: 'You' }).getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
});

test('the admin reaches the dashboard from the sheet, and the You tab is the current one there', async ({ page }) => {
  await open(page, 390);
  await openAccount(page);
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await expect(page.getByText('Admin Dashboard')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'You' })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('button', { name: /^Account menu/ })).toHaveAttribute('aria-current', 'page');
});

test('dark mode is a switch in the sheet, and the sheet stays open', async ({ page }) => {
  await open(page, 390);
  await openAccount(page);
  const dark = page.getByRole('switch', { name: 'Dark mode' });
  await expect(dark).toHaveAttribute('aria-checked', 'false');
  await dark.click();
  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('dialog', { name: 'You' })).toBeVisible();
});

test('a name can be set, and is saved to the account', async ({ page }) => {
  await open(page, 390);
  const saved: unknown[] = [];
  await page.route('**/auth/v1/user', (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    saved.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...MOCK_USER, user_metadata: { full_name: 'Anna Schmidt' } }) });
  });

  await openAccount(page);
  await page.getByRole('button', { name: /^Your name/ }).click();
  const form = page.getByRole('dialog', { name: 'Your name' });
  await form.getByLabel('Name').fill('Anna Schmidt');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ data: { full_name: 'Anna Schmidt' } });

  // The avatar takes its letters from the name, not from the email address.
  await expect(page.getByRole('navigation').getByRole('button', { name: /^Account menu/ })).toContainText('AS');
  await openAccount(page);
  await expect(page.getByRole('dialog', { name: 'You' })).toContainText('Anna Schmidt');
});

test('a name that cannot be saved is said in the form, and the form stays', async ({ page }) => {
  await open(page, 390);
  await page.route('**/auth/v1/user', (route) => (route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 500, msg: 'database is down' }) })
    : route.fallback()));
  await openAccount(page);
  await page.getByRole('button', { name: /^Your name/ }).click();
  const form = page.getByRole('dialog', { name: 'Your name' });
  await form.getByLabel('Name').fill('Anna');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByRole('alert')).toContainText('could not be saved');
  await expect(form.getByRole('alert')).not.toContainText('database');
  await expect(form.getByLabel('Name')).toHaveValue('Anna');
});

test('exporting asks first, and Cancel downloads nothing', async ({ page }) => {
  await open(page, 390);
  let downloads = 0;
  page.on('download', () => { downloads += 1; });

  await openAccount(page);
  await page.getByRole('button', { name: 'Export recipes', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Export your recipes?' });
  await expect(confirm).toContainText('Photo files are not in it');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  expect(downloads).toBe(0);

  await openAccount(page);
  await page.getByRole('button', { name: 'Export recipes', exact: true }).click();
  const download = page.waitForEvent('download');
  await confirm.getByRole('button', { name: 'Export', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^speisekammer-recipes-\d{4}-\d{2}-\d{2}\.json$/);
});
