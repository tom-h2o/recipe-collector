import { test, expect, type Page } from '@playwright/test';
import { installMockBackend, MOCK_RECIPES } from './support/mockBackend';

/**
 * "What can I cook?" in the app's own design: the sheet every short task
 * uses, progress and failures said inside it (not in a toast), what was typed
 * kept, and results as rows that open the recipe.
 */
async function open(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await installMockBackend(page);
  await page.goto('/');
  await expect(page.locator('.recipe-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Suggest a recipe' }).click();
  const sheet = page.getByRole('dialog', { name: 'What can I cook?' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('on a phone it is a sheet at the bottom, inside the screen', async ({ page }) => {
  const sheet = await open(page);
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBe(0);
  expect(Math.round(box.width)).toBe(390);
  expect(Math.round(box.y + box.height)).toBe(844);
  await expect(sheet.getByRole('button', { name: 'Suggest', exact: true })).toBeDisabled();
});

test('the button is the app\'s green, not a colour of its own', async ({ page }) => {
  const sheet = await open(page);
  await sheet.getByLabel('Ingredients you have').fill('tomatoes');
  const button = await sheet.getByRole('button', { name: 'Suggest', exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);
  // Compared with the one filled button of the top bar (behind the sheet, so
  // found by its label rather than by role).
  const add = await page.locator('header [aria-label="Add recipe"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(button).toBe(add);
});

test('suggestions are rows that open the recipe', async ({ page }) => {
  const sent: unknown[] = [];
  const sheet = await open(page);
  await page.route('**/api/suggest', (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [MOCK_RECIPES[1]] }) });
  });
  await sheet.getByLabel('Ingredients you have').fill('avocado, bread ,');
  await sheet.getByRole('button', { name: 'Suggest', exact: true }).click();

  const results = sheet.getByRole('region', { name: 'Suggestions' });
  await expect(results).toContainText('1 recipe fits');
  expect(sent).toEqual([{ ingredients: ['avocado', 'bread'] }]);
  // No toast: what happened is said in the sheet.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

  await results.getByRole('button', { name: /Avocado Toast/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Cook', exact: true })).toBeVisible();
});

test('nothing fitting, and a failure, are both said in the sheet with the text kept', async ({ page }) => {
  const sheet = await open(page);
  let fail = false;
  await page.route('**/api/suggest', (route) => (fail
    ? route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Daily AI limit reached. Try again tomorrow.' }) })
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [] }) })));

  const field = sheet.getByLabel('Ingredients you have');
  await field.fill('saffron');
  await sheet.getByRole('button', { name: 'Suggest', exact: true }).click();
  await expect(sheet.getByText('Nothing fits yet')).toBeVisible();

  fail = true;
  await sheet.getByRole('button', { name: 'Suggest', exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText('Daily AI limit reached');
  await expect(sheet.getByText('Nothing fits yet')).toHaveCount(0);
  await expect(field).toHaveValue('saffron');
});

// ── Reported from an iPhone ──────────────────────────────────────────────────

const LONG = [0, 1, 2].map((i) => ({
  ...MOCK_RECIPES[i % MOCK_RECIPES.length],
  id: `long-${i}`,
  title: `Geschmorte Rinderrouladen mit Rotkohl, Kartoffelklößen und einer sehr langen Soße ${i}`,
  ingredients: Array.from({ length: 14 }, (_, k) => ({ amount: '1', name: `Zutat mit langem Namen ${k}`, details: '' })),
}));

async function suggest(page: Page, sheet: Awaited<ReturnType<typeof open>>, suggestions: unknown[]) {
  await page.route('**/api/suggest', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions }) }));
  await sheet.getByLabel('Ingredients you have').fill('a');
  await sheet.getByRole('button', { name: 'Suggest', exact: true }).click();
  return sheet.getByRole('region', { name: 'Suggestions' });
}

for (const width of [320, 390]) {
  test(`at ${width} px, long recipe titles are cut short and the list stays inside the sheet`, async ({ page }) => {
    // The sheet is a grid, and its one column grew to the longest unbroken
    // line: with titles like these the content was 729 px wide on a 390 px
    // phone, so the rows ran off the right edge.
    const sheet = await open(page, width);
    const results = await suggest(page, sheet, LONG);
    await expect(results).toContainText('3 recipes fit');

    expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth), 'the sheet scrolls sideways').toBe(0);
    for (const row of await results.getByRole('button').all()) {
      const box = (await row.boundingBox())!;
      expect(box.x, 'a row starts inside the screen').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'a row ends inside the screen').toBeLessThanOrEqual(width);
      // A title and two lines of ingredients, not all fourteen of them.
      expect(box.height, 'a row lists every ingredient').toBeLessThan(90);
    }
    // The arrow at the end of a row is what went missing first.
    const arrow = (await results.getByRole('button').first().locator('svg').last().boundingBox())!;
    expect(arrow.x + arrow.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('with the keyboard open the sheet sits on top of it, and fits above it', async ({ page }) => {
  // An iPhone's keyboard slides over the bottom of the page without resizing
  // it. The sheet was pinned to that bottom, so Safari pushed the page up to
  // show the field and the sheet landed in the middle of the screen. Chromium
  // has no on-screen keyboard; what it reports is what an iPhone reports:
  // a visual viewport shorter than the page.
  const sheet = await open(page);
  await suggest(page, sheet, LONG);
  const keyboard = async (height: number) => page.evaluate((h) => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - h });
    vv.dispatchEvent(new Event('resize'));
  }, height);

  await keyboard(336);
  await expect.poll(async () => { const b = (await sheet.boundingBox())!; return Math.round(b.y + b.height); }).toBe(844 - 336);
  const box = (await sheet.boundingBox())!;
  expect(box.y, 'the top of the sheet is still on screen').toBeGreaterThanOrEqual(0);
  await expect(sheet.getByLabel('Ingredients you have')).toBeInViewport();

  // Keyboard away: back on the bottom edge.
  await keyboard(0);
  await expect.poll(async () => { const b = (await sheet.boundingBox())!; return Math.round(b.y + b.height); }).toBe(844);
});

test('each suggestion is shown in the language its recipe was last read in', async ({ page }) => {
  // As its card in the vault is. They were all shown in their original.
  const sheet = await open(page);
  const pizza = { ...MOCK_RECIPES[0], id: 'tr-1', preferred_language: 'de' };
  const toast = { ...MOCK_RECIPES[1], id: 'tr-2', preferred_language: null };
  const untranslated = { ...MOCK_RECIPES[0], id: 'tr-3', title: 'Lentil Soup', preferred_language: 'fr' };
  const asked: string[] = [];
  await page.route('**/rest/v1/recipe_translations**', (route) => {
    asked.push(new URL(route.request().url()).searchParams.get('recipe_id') ?? '');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { recipe_id: 'tr-1', language_code: 'de', title: 'Klassische Pizza Margherita', description: null, instructions: 'Backen.', ingredients: [{ amount: '250 g', name: 'Mehl', details: '' }, { amount: '1', name: 'Mozzarella', details: '' }] },
      // Another language of the same recipe is not the one it was read in.
      { recipe_id: 'tr-1', language_code: 'es', title: 'Pizza Margarita clásica', description: null, instructions: 'Hornear.', ingredients: [{ amount: '250 g', name: 'harina', details: '' }] },
    ]) });
  });

  const results = await suggest(page, sheet, [pizza, toast, untranslated]);
  await expect(results).toContainText('3 recipes fit');
  const rows = results.getByRole('button');
  await expect(rows.nth(0)).toContainText('Klassische Pizza Margherita');
  await expect(rows.nth(0)).toContainText('Mehl · Mozzarella');
  await expect(results.getByText('Pizza Margarita clásica')).toHaveCount(0);
  // Never read in another language: its own title.
  await expect(rows.nth(1)).toContainText(MOCK_RECIPES[1].title);
  // A language with no stored translation: the original, not an empty row.
  await expect(rows.nth(2)).toContainText('Lentil Soup');
  // One query, for the recipes that have a language, and none for the others.
  expect(asked).toEqual(['in.(tr-1,tr-3)']);
});
