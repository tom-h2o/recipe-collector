import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * Collections in the vault: one row of chips, a "+" that asks for the name in
 * a sheet, and "Edit" for renaming and deleting. Rename and delete used to be
 * icons that only appeared on mouse hover, so a phone could not reach them,
 * and delete did not ask.
 *
 * The table here behaves like one: rows are stored, changed and removed.
 */
interface Row { id: string; name: string; user_id: string; created_at: string }

async function open(page: Page, initial: string[] = ['Weeknight', 'Baking', 'For guests']) {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockBackend(page);
  const rows: Row[] = initial.map((name, i) => ({ id: `c${i + 1}`, name, user_id: 'u', created_at: `2026-01-0${i + 1}` }));
  const links: { collection_id: string; recipe_id: string }[] = [];
  let next = rows.length + 1;

  await page.route('**/rest/v1/collections*', async (route) => {
    const request = route.request();
    const id = new URL(request.url()).searchParams.get('id')?.replace('eq.', '');
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'POST') {
      const row: Row = { id: `c${next++}`, name: (request.postDataJSON() as { name: string }).name, user_id: 'u', created_at: '2026-02-01' };
      rows.push(row);
      return json(row, 201);
    }
    if (request.method() === 'PATCH') {
      const row = rows.find((r) => r.id === id);
      if (row) row.name = (request.postDataJSON() as { name: string }).name;
      return json([]);
    }
    if (request.method() === 'DELETE') {
      const at = rows.findIndex((r) => r.id === id);
      if (at >= 0) rows.splice(at, 1);
      return json([]);
    }
    return json(rows);
  });
  await page.route('**/rest/v1/recipe_collections*', async (route) => {
    if (route.request().method() === 'POST') {
      links.push(route.request().postDataJSON() as { collection_id: string; recipe_id: string });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(links) });
  });

  await page.goto('/');
  await expect(page.locator('.recipe-card').first()).toBeVisible();
  return { rows, links, bar: page.getByRole('group', { name: 'Collections' }) };
}

test('the chips sit on one line, with + and Edit, and nothing to rename or delete in the row', async ({ page }) => {
  const { bar } = await open(page);
  await expect(bar.getByRole('button')).toHaveText([/^Weeknight/, /^Baking/, /^For guests/, '', /Edit/]);
  const tops = await bar.getByRole('button').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size, 'the row wraps').toBe(1);
  await expect(page.getByTitle('Delete collection')).toHaveCount(0);
  await expect(page.getByTitle('Rename collection')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('+ asks for the name in a sheet and adds the chip', async ({ page }) => {
  const { rows, bar } = await open(page);
  await bar.getByRole('button', { name: 'New collection' }).click();
  const sheet = page.getByRole('dialog', { name: 'New collection' });
  await expect(sheet.getByRole('button', { name: 'Create' })).toBeDisabled();
  await sheet.getByLabel('Collection name').fill('Summer');
  await sheet.getByRole('button', { name: 'Create' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(bar.getByRole('button', { name: /^Summer/ })).toBeVisible();
  expect(rows.map((r) => r.name)).toContain('Summer');
});

test('with no collections the + is named, and there is nothing to edit', async ({ page }) => {
  const { bar } = await open(page, []);
  await expect(bar.getByRole('button')).toHaveText([/New collection/]);
});

test('Edit renames a collection', async ({ page }) => {
  const { rows, bar } = await open(page);
  await bar.getByRole('button', { name: 'Edit collections' }).click();
  const sheet = page.getByRole('dialog', { name: 'Collections' });
  await sheet.getByRole('button', { name: 'Rename Baking' }).click();
  await sheet.getByLabel('New name for Baking').fill('Bread and cake');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.getByText('Bread and cake')).toBeVisible();
  expect(rows.find((r) => r.id === 'c2')?.name).toBe('Bread and cake');
  await page.keyboard.press('Escape');
  await expect(bar.getByRole('button', { name: /^Bread and cake/ })).toBeVisible();
});

test('deleting asks first: "Keep it" keeps it, "Delete" removes it', async ({ page }) => {
  const { rows, bar } = await open(page);
  await bar.getByRole('button', { name: 'Edit collections' }).click();
  const list = page.getByRole('dialog', { name: 'Collections' });
  await list.getByRole('button', { name: 'Delete Baking' }).click();

  const confirm = page.getByRole('dialog', { name: 'Delete “Baking”?' });
  await expect(confirm).toBeVisible();
  expect(rows).toHaveLength(3);
  await confirm.getByRole('button', { name: 'Keep it' }).click();
  await expect(list.getByText('Baking')).toBeVisible();
  expect(rows).toHaveLength(3);

  await list.getByRole('button', { name: 'Delete Baking' }).click();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  // Back on the list once the delete has gone through.
  await expect(list.getByRole('button', { name: 'Rename Weeknight' })).toBeVisible();
  await expect(list.getByText('Baking')).toHaveCount(0);
  expect(rows.map((r) => r.name)).toEqual(['Weeknight', 'For guests']);
  await page.keyboard.press('Escape');
  await expect(bar.getByRole('button', { name: /^Baking/ })).toHaveCount(0);
});

test('a recipe can start a new collection from its own page, and is put into it', async ({ page }) => {
  const { rows, links } = await open(page, []);
  await page.locator('.recipe-card').first().getByText('Classic Margherita Pizza').click();
  const recipe = page.getByRole('dialog');
  await recipe.getByRole('button', { name: 'New collection' }).click();
  await recipe.getByLabel('New collection name').fill('Pizza night');
  await recipe.getByRole('button', { name: 'Add', exact: true }).click();

  await expect.poll(() => rows.map((r) => r.name)).toEqual(['Pizza night']);
  await expect.poll(() => links.length).toBe(1);
  expect(links[0].collection_id).toBe(rows[0].id);
  // The recipe is still open, now showing the collection it is in.
  await expect(recipe.getByRole('button', { name: 'Pizza night' })).toBeVisible();
});
