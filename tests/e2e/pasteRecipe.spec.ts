import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * Adding a recipe by pasting its text: the fourth way in, beside URL, photo
 * and PDF, for recipes that arrive in a chat message or a note.
 */

const PASTED = `Omas Pfannkuchen

250g Mehl, 3 Eier, 500ml Milch, 1 Prise Salz
Alles verrühren, 30 Minuten ruhen lassen und in Butter ausbacken.`;

const EXTRACTED = {
  title: 'Omas Pfannkuchen',
  description: 'Dünne Pfannkuchen wie bei Oma.',
  original_language: 'de',
  servings: 4,
  prep_time_mins: 10,
  cook_time_mins: 20,
  ingredients: [
    { amount: '250g', name: 'Mehl', details: '' },
    { amount: '3', name: 'Eier', details: '' },
  ],
  instructions: 'Alles verrühren.\n30 Minuten ruhen lassen.\nIn Butter ausbacken.',
  image_url: '',
  source_name: '',
  cached: false,
};

async function openTextTab(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /add recipe/i }).click();
  await expect(page.getByText('Add New Recipe')).toBeVisible();
  await page.getByRole('button', { name: 'From Text', exact: true }).click();
}

test.describe('pasting a recipe as text', () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page);
  });

  test('fills the form from the pasted text', async ({ page }) => {
    // Registered after the mock backend, so it takes precedence for this route.
    let sent: unknown;
    await page.route('**/api/extract', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EXTRACTED) });
    });

    await openTextTab(page);
    const extract = page.getByRole('button', { name: 'Extract Recipe from Text' });
    // Nothing to read yet, and a few words are not a recipe.
    await expect(extract).toBeDisabled();
    await page.getByLabel('Recipe text').fill('Pfannkuchen');
    await expect(extract).toBeDisabled();

    await page.getByLabel('Recipe text').fill(PASTED);
    await extract.click();

    await expect(page.getByLabel('Title')).toHaveValue('Omas Pfannkuchen');
    await expect(page.getByLabel('Instructions')).toHaveValue(EXTRACTED.instructions);
    // Exact, or "ingredient" also matches the vault's search box behind the dialog.
    await expect(page.getByPlaceholder('ingredient', { exact: true }).first()).toHaveValue('Mehl');
    await expect(page.getByPlaceholder('qty', { exact: true }).first()).toHaveValue('250g');
    // The text and nothing else: no url, no file.
    expect(sent).toEqual({ text: PASTED });
  });

  test('keeps the pasted text when no recipe is found in it', async ({ page }) => {
    const message = 'No recipe was found in that text. Paste the ingredients and the steps, then try again.';
    await page.route('**/api/extract', (route) =>
      route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: message }) }));

    await openTextTab(page);
    const chatter = 'Hallo Anna, bis Samstag dann! Bringst du den Wein mit?';
    await page.getByLabel('Recipe text').fill(chatter);
    await page.getByRole('button', { name: 'Extract Recipe from Text' }).click();

    await expect(page.getByText(message)).toBeVisible();
    // Still there to correct, and nothing was written into the form.
    await expect(page.getByLabel('Recipe text')).toHaveValue(chatter);
    await expect(page.getByLabel('Title')).toHaveValue('');
  });

  for (const width of [320, 390]) {
    test(`all four import tabs fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openTextTab(page);
      // The dialog scales in. Measured mid-animation every box is transformed,
      // which puts the tabs somewhere they never rest.
      await page.evaluate(() =>
        Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));

      const tabs = ['From URL', 'From Photo', 'From PDF', 'From Text'].map((name) =>
        // Exact: "From Text" is also the tail of "Extract Recipe from Text".
        page.getByRole('button', { name, exact: true }));
      const boxes = [];
      for (const tab of tabs) {
        await expect(tab).toBeVisible();
        boxes.push((await tab.boundingBox())!);
        // The label is not cut off inside its tab.
        expect(await tab.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      // One row, left to right, none pushed off the edge.
      for (const box of boxes) {
        expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(1);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      expect(boxes[3].x).toBeGreaterThan(boxes[2].x);
    });
  }
});
