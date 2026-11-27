import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * The vault's filters: Favourites and Under 30 min as chips, one Filters
 * button that opens a sheet with every tag by group, and Shared last. They
 * combine, what was chosen shows in the row with an ✕, a tag tapped on a card
 * lands there too, and the recipe's tag editor is grouped the same way.
 */

async function open(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await installMockBackend(page);
  const queries: string[] = [];
  await page.route('**/rest/v1/recipes?*', async (route) => {
    if (route.request().method() === 'GET') queries.push(decodeURIComponent(route.request().url()));
    return route.fallback();
  });
  await page.goto('/');
  await expect(page.locator('.recipe-card').first()).toBeVisible();
  return { queries, filters: page.getByRole('group', { name: 'Filters' }) };
}

/** The tags the newest recipes query asked for, as PostgREST writes `contains`. */
const lastTagFilter = (queries: string[]) => queries.at(-1)?.match(/tags=cs\.\{([^}]*)\}/)?.[1] ?? null;

test('the row holds one Filters button, Favourites, Under 30 min, and Shared last', async ({ page }) => {
  const { filters } = await open(page);
  await expect(filters.getByRole('button')).toHaveText(['Filters', 'Favourites', 'Under 30 min', 'Shared']);
  // No menu per group and no chip per tag in the row.
  await expect(filters.getByRole('button', { name: 'Diet', exact: true })).toHaveCount(0);
  await expect(filters.getByRole('button', { name: 'Vegan', exact: true })).toHaveCount(0);
});

test('on a phone the whole row is on screen without scrolling', async ({ page }) => {
  // Only "Die…" of the five group menus used to be in view at this width.
  const { filters } = await open(page, 390);
  for (const name of ['Favourites', 'Under 30 min', 'Filters']) {
    const box = (await filters.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(390);
  }
});

test('the Filters sheet shows every tag at once, by group, inside a phone screen', async ({ page }) => {
  const { filters } = await open(page, 390);
  await filters.getByRole('button', { name: 'Filters', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await expect(sheet).toBeVisible();
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));

  for (const group of ['Diet', 'Cuisine', 'Meal', 'Main ingredient', 'More']) {
    await expect(sheet.getByRole('group', { name: group })).toBeVisible();
  }
  // 30 tags: all 31 but Under 30 min, which has its own chip in the row.
  await expect(sheet.locator('section').getByRole('button')).toHaveCount(30);
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(900.5);

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.recipe-card').first()).toBeVisible();
});

test('choices from different groups combine, and each can be cleared on its own', async ({ page }) => {
  const { queries, filters } = await open(page);
  const openSheet = filters.getByRole('button', { name: /^Filters/ });
  const sheet = page.getByRole('dialog', { name: 'Filters' });

  await openSheet.click();
  await sheet.getByRole('button', { name: 'Vegan', exact: true }).click();
  await expect.poll(() => lastTagFilter(queries)).toBe('Vegan');
  await sheet.getByRole('button', { name: 'Italian', exact: true }).click();
  await expect.poll(() => lastTagFilter(queries)).toBe('Vegan,Italian');

  // Another diet replaces the first; the cuisine stays.
  await expect(sheet.getByRole('button', { name: 'Vegan', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Vegetarian', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Vegan', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => lastTagFilter(queries)).toBe('Italian,Vegetarian');
  await sheet.getByRole('button', { name: 'Show recipes' }).click();
  await expect(sheet).toHaveCount(0);

  // What was chosen is in the row, and the button says how many.
  await expect(filters.getByRole('button', { name: 'Diet: Vegetarian' })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Cuisine: Italian' })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Filters, 2 chosen' })).toBeVisible();

  // A direct chip goes with them, as a row property rather than a tag.
  await filters.getByRole('button', { name: 'Favourites', exact: true }).click();
  await expect.poll(() => queries.at(-1)).toContain('is_favourite=eq.true');
  expect(lastTagFilter(queries)).toBe('Italian,Vegetarian');

  // The ✕ clears one group; Clear clears everything.
  await filters.getByRole('button', { name: 'Clear cuisine filter' }).click();
  await expect.poll(() => lastTagFilter(queries)).toBe('Vegetarian');
  await filters.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect.poll(() => lastTagFilter(queries)).toBeNull();
  await expect(filters.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();
});

test('tapping the chosen tag again takes it off, and the sheet\'s Clear keeps Favourites', async ({ page }) => {
  const { queries, filters } = await open(page);
  await filters.getByRole('button', { name: 'Favourites', exact: true }).click();
  await filters.getByRole('button', { name: /^Filters/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });

  await sheet.getByRole('button', { name: 'Soup', exact: true }).click();
  await expect.poll(() => lastTagFilter(queries)).toBe('Soup');
  await sheet.getByRole('button', { name: 'Soup', exact: true }).click();
  await expect.poll(() => lastTagFilter(queries)).toBeNull();

  await sheet.getByRole('button', { name: 'Chicken', exact: true }).click();
  await sheet.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect.poll(() => lastTagFilter(queries)).toBeNull();
  // The sheet's Clear is about its tags; the Favourites chip is not one of them.
  expect(queries.at(-1)).toContain('is_favourite=eq.true');
});

test('on a phone, what was chosen stays on screen beside the Filters button', async ({ page }) => {
  const { filters } = await open(page, 390);
  await filters.getByRole('button', { name: 'Filters', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await sheet.getByRole('button', { name: 'Vegetarian', exact: true }).click();
  await sheet.getByRole('button', { name: 'Italian', exact: true }).click();
  await sheet.getByRole('button', { name: 'Show recipes' }).click();
  for (const name of ['Clear', 'Filters, 2 chosen', 'Diet: Vegetarian', 'Cuisine: Italian', 'Clear cuisine filter']) {
    const box = (await filters.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(390);
  }
});

test('a tag tapped on a card lands in the row as its group\'s chip', async ({ page }) => {
  const { queries, filters } = await open(page);
  await page.locator('.recipe-card', { hasText: 'Avocado Toast' }).getByRole('button', { name: 'Breakfast' }).click();
  await expect(filters.getByRole('button', { name: 'Meal: Breakfast' })).toBeVisible();
  await expect.poll(() => lastTagFilter(queries)).toBe('Breakfast');
});

test('the sort order is a button beside the search, with the choices in a menu', async ({ page }) => {
  // 360 px: the narrowest common phone.
  const { queries } = await open(page, 360);
  const sort = page.getByRole('button', { name: /^Sort recipes/ });
  await expect(sort).toHaveAccessibleName('Sort recipes: Newest first');
  // It leaves the search field the row: the field's hint is no longer cut off.
  const search = page.getByPlaceholder(/Search recipes/);
  // Polled: the row is measured once fonts and layout have settled.
  await expect.poll(() => search.evaluate((el: HTMLInputElement) => {
    const style = getComputedStyle(el);
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const hint = context.measureText(el.placeholder).width;
    const field = el.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return hint > 50 && hint <= field;
  })).toBe(true);

  await sort.click();
  await page.getByRole('menuitemradio', { name: 'A → Z' }).click();
  await expect(sort).toHaveAccessibleName('Sort recipes: A → Z');
  await expect.poll(() => queries.at(-1) ?? '').toContain('order=title.asc');
});

test('the recipe\'s tag editor is grouped like the filters', async ({ page }) => {
  await open(page);
  await page.locator('.recipe-card', { hasText: 'Classic Margherita Pizza' }).getByText('Classic Margherita Pizza').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByTitle('Edit tags').click();
  for (const group of ['Diet', 'Cuisine', 'Meal', 'Main ingredient', 'More']) {
    await expect(dialog.getByText(group, { exact: true })).toBeVisible();
  }
  // New tags are on offer.
  for (const tag of ['German', 'Chicken', 'Pasta', 'Meal Prep']) {
    await expect(dialog.getByRole('button', { name: `Add tag ${tag}` })).toBeVisible();
  }
});

test('the search asks for every typed word, anywhere in the recipe', async ({ page }) => {
  // Two words used to be a syntax error in the database's full-text search;
  // the list silently kept the previous result.
  const { queries } = await open(page);
  await page.getByPlaceholder(/Search recipes/).fill('Kartoffel Suppe');
  await expect.poll(() => queries.at(-1) ?? '').toContain('search_text=ilike.%kartoffel%');
  expect(queries.at(-1)).toContain('search_text=ilike.%suppe%');
  expect(queries.at(-1)).not.toContain('search_vector');
});

test('a search that finds nothing says so, instead of calling the vault empty', async ({ page }) => {
  const { queries } = await open(page);
  await page.route('**/rest/v1/recipes?*', (route) =>
    route.request().url().includes('search_text')
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      : route.fallback());
  await page.getByPlaceholder(/Search recipes/).fill('gibtsnicht');
  await expect(page.getByText('No results found')).toBeVisible();
  await expect(page.getByText('The vault is empty')).toHaveCount(0);
  expect(queries.length).toBeGreaterThan(0);
});

test('a list that cannot be loaded says so and can be tried again', async ({ page }) => {
  await open(page);
  let fail = true;
  await page.route('**/rest/v1/recipes?*', (route) =>
    fail && route.request().url().includes('search_text')
      ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42703', message: 'column recipes.search_text does not exist' }) })
      : route.fallback());
  await page.getByPlaceholder(/Search recipes/).fill('suppe');
  const alert = page.getByRole('alert').filter({ hasText: 'could not be loaded' });
  await expect(alert).toBeVisible();

  fail = false;
  await alert.getByRole('button', { name: 'Try again' }).click();
  await expect(alert).toHaveCount(0);
  await expect(page.locator('.recipe-card').first()).toBeVisible();
});
