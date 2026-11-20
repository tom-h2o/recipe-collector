import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * Sending a recipe to a friend from the open recipe.
 *
 * The recipe used to be closed the moment the send form appeared, so after
 * sending — or cancelling — you were back at the vault and had to find the
 * recipe again. That was a workaround, not a decision: the form was a plain
 * overlay, and with the recipe's dialog still open it could not take a click
 * and Escape closed the recipe underneath it.
 *
 * It is now a dialog nested inside the recipe's. What must hold: the recipe is
 * still there behind it, and every way out of the form leaves the recipe open.
 */

/** The drawer by its element, not its role: while the form is on top the drawer is rightly hidden from assistive technology. */
const drawer = (page: Page) =>
  page.locator('[data-slot="dialog-content"]').filter({ hasText: 'Prepare dough.' });

async function openSendForm(page: Page) {
  await installMockBackend(page);
  await page.goto('/');
  await page.getByText('Classic Margherita Pizza').click();
  await expect(drawer(page)).toBeVisible();
  await page.getByTitle('Send recipe to someone').click();
  await expect(page.getByRole('dialog', { name: 'Send recipe' })).toBeVisible();
}

test.describe('sending a recipe from the open recipe', () => {
  test('the recipe stays open behind the form, and the email field is ready to type in', async ({ page }) => {
    await openSendForm(page);

    await expect(drawer(page)).toBeVisible();
    await expect(page.getByLabel('Recipient email')).toBeFocused();
    await page.keyboard.type('friend@example.com');
    await expect(page.getByLabel('Recipient email')).toHaveValue('friend@example.com');
    // Clicking into the field works too; as an overlay beside the drawer it did not.
    await page.getByLabel('Recipient email').click();
    await expect(drawer(page)).toBeVisible();
  });

  test('Escape closes the form first and the recipe only on a second press', async ({ page }) => {
    await openSendForm(page);

    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Recipient email')).toBeHidden();
    await expect(drawer(page)).toBeVisible();
    // Focus goes back to where it came from, so a keyboard user is not dropped at the top of the page.
    await expect(page.getByTitle('Send recipe to someone')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(drawer(page)).toBeHidden();
  });

  test('Cancel leaves the recipe open', async ({ page }) => {
    await openSendForm(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByLabel('Recipient email')).toBeHidden();
    await expect(drawer(page)).toBeVisible();
  });

  test('a click beside the form closes the form, not the recipe', async ({ page }) => {
    await openSendForm(page);
    await page.mouse.click(15, 15);
    await expect(page.getByLabel('Recipient email')).toBeHidden();
    await expect(drawer(page)).toBeVisible();
  });

  test('after sending, you are still in the recipe', async ({ page }) => {
    await openSendForm(page);
    let sent: unknown;
    await page.route('**/api/share', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.getByLabel('Recipient email').fill('friend@example.com');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText('Recipe sent to friend@example.com!')).toBeVisible();
    await expect(page.getByLabel('Recipient email')).toBeHidden();
    await expect(drawer(page)).toBeVisible();
    expect(sent).toMatchObject({ action: 'send', recipeId: 'recipe-a', recipientEmail: 'friend@example.com' });
  });

  test('closing the recipe does not leave a send form behind', async ({ page }) => {
    await openSendForm(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toBeHidden();

    // Opening another recipe must not bring the form back with it.
    await page.getByText('Avocado Toast').click();
    await expect(page.locator('[data-slot="dialog-content"]').first()).toBeVisible();
    await expect(page.getByLabel('Recipient email')).toHaveCount(0);
  });
});
