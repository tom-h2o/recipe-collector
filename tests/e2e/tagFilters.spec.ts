import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * The vault's filters: three chips of their own and one menu per tag group.
 * They combine, a chosen group shows in its chip with an ✕, a tag tapped on a
 * card lands in its group, and the recipe's tag editor is grouped the same way.
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

test('three chips of their own, the rest in one menu per group', async ({ page }) => {
  const { filters } = await open(page);
  for (const name of ['Favourites', 'Shared', 'Under 30 min']) {
    await expect(filters.getByRole('button', { name, exact: true })).toBeVisible();
  }
  for (const name of ['Diet', 'Cuisine', 'Meal', 'Main ingredient', 'More']) {
    await expect(filters.getByRole('button', { name, exact: true })).toHaveAttribute('aria-haspopup', 'menu');
  }
  // No chip per tag any more.
  await expect(filters.getByRole('button', { name: 'Vegan', exact: true })).toHaveCount(0);
});

test('choices from different groups combine, and each can be cleared on its own', async ({ page }) => {
  const { queries, filters } = await open(page);

  await filters.getByRole('button', { name: 'Diet', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Vegan' }).click();
  await expect(filters.getByRole('button', { name: 'Diet: Vegan' })).toBeVisible();
  await expect.poll(() => lastTagFilter(queries)).toBe('Vegan');

  await filters.getByRole('button', { name: 'Cuisine', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Italian' }).click();
  await expect.poll(() => lastTagFilter(queries)).toBe('Vegan,Italian');

  // Another diet replaces the first; the cuisine stays.
  await filters.getByRole('button', { name: 'Diet: Vegan' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Vegan' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemradio', { name: 'Vegetarian' }).click();
  await expect.poll(() => lastTagFilter(queries)).toBe('Italian,Vegetarian');

  // A direct chip goes with them, as a row property rather than a tag.
  await filters.getByRole('button', { name: 'Favourites', exact: true }).click();
  await expect.poll(() => queries.at(-1)).toContain('is_favourite=eq.true');
  expect(lastTagFilter(queries)).toBe('Italian,Vegetarian');

  // The ✕ clears one group; Clear clears everything.
  await filters.getByRole('button', { name: 'Clear cuisine filter' }).click();
  await expect.poll(() => lastTagFilter(queries)).toBe('Vegetarian');
  await filters.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect.poll(() => lastTagFilter(queries)).toBeNull();
  await expect(filters.getByRole('button', { name: 'Diet', exact: true })).toBeVisible();
});

test('a tag tapped on a card lands in its group\'s chip', async ({ page }) => {
  const { queries, filters } = await open(page);
  await page.locator('.recipe-card', { hasText: 'Avocado Toast' }).getByRole('button', { name: 'Breakfast' }).click();
  await expect(filters.getByRole('button', { name: 'Meal: Breakfast' })).toBeVisible();
  await expect.poll(() => lastTagFilter(queries)).toBe('Breakfast');
});

test('on a phone the menu opens inside the screen, under its chip', async ({ page }) => {
  const { filters } = await open(page, 390);
  const chip = filters.getByRole('button', { name: 'Main ingredient', exact: true });
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitemradio', { name: 'Fish & Seafood' })).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThan((await chip.boundingBox())!.y);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
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
