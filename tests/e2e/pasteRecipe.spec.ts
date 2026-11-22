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

async function openAddRecipe(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /add recipe/i }).click();
  await expect(page.getByRole('heading', { name: 'Add a recipe' })).toBeVisible();
}

async function openTextTab(page: Page) {
  await openAddRecipe(page);
  await page.getByRole('button', { name: /^From text/ }).click();
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
    const extract = page.getByRole('button', { name: 'Read recipe' });
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
    await page.getByRole('button', { name: 'Read recipe' }).click();

    // Said in the step itself, not in a toast; still there to correct, and the
    // editor was not opened.
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(message);
    await expect(page.getByLabel('Recipe text')).toHaveValue(chatter);
    await expect(page.getByLabel('Title')).toHaveCount(0);
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });

  test('a site that blocks the link says so and leads to the text tab, keeping the link', async ({ page }) => {
    // rewe.de, edeka.de and others refuse pages to servers. The form used to show
    // "Failed to fetch URL: Forbidden" and leave the person there.
    const REWE = 'https://www.rewe.de/rezepte/klassische-kuerbissuppe/';
    const sent: unknown[] = [];
    await page.route('**/api/extract', async (route) => {
      const body = route.request().postDataJSON() as { url?: string; text?: string };
      sent.push(body);
      return body.url
        ? route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({
          code: 'site_blocked', site: 'rewe.de',
          error: 'rewe.de does not let apps read its pages, so this recipe cannot be imported from the link.',
        }) })
        : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EXTRACTED) });
    });

    await openAddRecipe(page);
    await page.getByRole('button', { name: /^From a website/ }).click();
    await page.getByLabel('Recipe link').fill(REWE);
    await page.getByRole('button', { name: 'Read recipe' }).click();

    const alert = page.getByRole('dialog').getByRole('alert');
    await expect(alert).toContainText('rewe.de does not let apps read its pages');
    await expect(alert).toContainText('Full Page');
    await alert.getByRole('button', { name: 'Paste text' }).click();

    await page.getByLabel('Recipe text').fill(PASTED);
    await page.getByRole('button', { name: 'Read recipe' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('Omas Pfannkuchen');
    // The recipe still points back to where it came from.
    await expect(page.locator('#source-url')).toHaveValue(REWE);
    await expect(page.locator('#source-name')).toHaveValue('rewe.de');
    expect(sent).toEqual([{ url: REWE }, { text: PASTED }]);
  });

  for (const width of [320, 390]) {
    test(`the choices fit at ${width}px, each on one row`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openAddRecipe(page);
      // The dialog scales in. Measured mid-animation every box is transformed.
      await page.evaluate(() =>
        Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));

      const choices = [/^From a website/, /^From photos/, /^From a PDF/, /^From text/, /^Enter it manually/]
        .map((name) => page.getByRole('button', { name }));
      for (const choice of choices) {
        await expect(choice).toBeVisible();
        const box = (await choice.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      // Nothing in the dialog scrolls sideways.
      expect(await page.getByRole('dialog').evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
    });
  }

});

/**
 * The dialog's shape: a choice first (four ways to import, one button for the
 * editor), the editor only after that, and one progress indicator while a
 * recipe is read: the vault animation, not that plus a toast.
 */
test.describe('adding a recipe', () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page);
  });

  test('opens on the choices; "Enter it manually" opens the empty editor, and Back returns', async ({ page }) => {
    await openAddRecipe(page);
    // No editor fields yet: the choice comes first.
    await expect(page.getByLabel('Title')).toHaveCount(0);
    await page.getByRole('button', { name: /^Enter it manually/ }).click();
    await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Save Recipe' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Add a recipe' })).toBeVisible();
  });

  test('while reading, the vault animation is the only progress, and Cancel goes back with the link kept', async ({ page }) => {
    let release: () => void = () => {};
    await page.route('**/api/extract', async (route) => {
      await new Promise<void>((resolve) => { release = resolve; });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EXTRACTED) }).catch(() => {});
    });
    await openAddRecipe(page);
    await page.getByRole('button', { name: /^From a website/ }).click();
    await page.getByLabel('Recipe link').fill('https://example.com/pfannkuchen');
    await page.getByRole('button', { name: 'Read recipe' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('status')).toHaveText('Reading the recipe');
    await expect(dialog.locator('.vault-anim svg')).toBeVisible();
    await expect(dialog).toContainText('Opening example.com');
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByLabel('Recipe link')).toHaveValue('https://example.com/pfannkuchen');
    release();
  });

  test('a finished read shows the closed vault, then the editor with where it came from', async ({ page }) => {
    await page.route('**/api/extract', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...EXTRACTED, source_name: '' }) }));
    await openAddRecipe(page);
    await page.getByRole('button', { name: /^From a website/ }).click();
    await page.getByLabel('Recipe link').fill('https://www.example.com/pfannkuchen');
    await page.getByRole('button', { name: 'Read recipe' }).click();

    await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Got it');
    await expect(page.getByLabel('Title')).toHaveValue('Omas Pfannkuchen');
    await expect(page.getByRole('dialog')).toContainText('Read from example.com. Check it over, then save.');
    await expect(page.locator('#source-url')).toHaveValue('https://www.example.com/pfannkuchen');
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });

  test('editing a recipe opens straight on the editor, with no way back to the choices', async ({ page }) => {
    await page.goto('/');
    await page.locator('.recipe-card', { hasText: 'Classic Margherita Pizza' }).click();
    await page.getByRole('dialog').getByTitle('More options').click();
    await page.getByRole('menu').getByRole('button', { name: /edit recipe/i }).click();
    await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Classic Margherita Pizza');
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });
});
