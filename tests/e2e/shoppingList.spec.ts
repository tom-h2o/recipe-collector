import { test, expect, type Page } from '@playwright/test';
import { installMockBackend, MOCK_RECIPES } from './support/mockBackend';

/**
 * The shopping list keeps what a person put on it themselves. "Generate" used
 * to delete the whole list before rebuilding it, and there was no field to add
 * an item at all, although the empty list said there was.
 *
 * The table here behaves like one: rows are stored, filtered deletes remove
 * what they match, and the list read back is what is left.
 */
interface Row { id: string; item: string; category: string | null; is_checked: boolean; from_plan: boolean }

async function openShopping(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockBackend(page);
  const rows: Row[] = [];
  const deletes: string[] = [];
  let nextId = 1;

  await page.route('**/rest/v1/shopping_list*', async (route) => {
    const request = route.request();
    const url = decodeURIComponent(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Partial<Row> | Partial<Row>[];
      const made = (Array.isArray(body) ? body : [body]).map((r) => ({
        id: `item-${nextId++}`, item: r.item ?? '', category: r.category ?? null, is_checked: false, from_plan: r.from_plan ?? false,
      }));
      rows.push(...made);
      // `.select().single()` asks for the one row as an object.
      return json(request.headers()['accept']?.includes('vnd.pgrst.object') ? made[0] : made, 201);
    }
    if (request.method() === 'DELETE') {
      deletes.push(url);
      const onlyGenerated = url.includes('from_plan=eq.true');
      for (let i = rows.length - 1; i >= 0; i--) if (!onlyGenerated || rows[i].from_plan) rows.splice(i, 1);
      return json([]);
    }
    return json(rows);
  });

  // One dinner tomorrow, so there is something to generate from.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await page.route('**/rest/v1/meal_plan*', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: 'plan-1', date: tomorrow.toISOString().slice(0, 10), meal_type: 'dinner', recipe_id: MOCK_RECIPES[0].id, recipe: MOCK_RECIPES[0] }]),
  }));
  await page.route('**/api/shopping', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ list: [{ category: 'Produce', items: ['3 onions', '1 kg potatoes'] }] }),
  }));

  await page.goto('/');
  await page.getByRole('button', { name: 'Shopping' }).last().click();
  await expect(page.getByText('Your shopping list is empty.')).toBeVisible();
  return { rows, deletes };
}

test('an item can be typed in, and generating from the meal plan keeps it', async ({ page }) => {
  const { rows, deletes } = await openShopping(page);

  await page.getByLabel('Add an item to the shopping list').fill('Coffee');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Coffee')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your items' })).toBeVisible();
  expect(rows).toMatchObject([{ item: 'Coffee', from_plan: false }]);

  await page.getByRole('button', { name: /^Generate/ }).click();
  await expect(page.getByText('3 onions')).toBeVisible();
  await expect(page.getByText('Coffee')).toBeVisible();
  await expect(page.getByText('Your own item was kept')).toBeVisible();
  // The delete named the generated rows; it did not empty the list.
  expect(deletes).toHaveLength(1);
  expect(deletes[0]).toContain('from_plan=eq.true');

  // Generating again replaces the generated items instead of doubling them.
  await page.getByRole('button', { name: /^Generate/ }).click();
  await expect.poll(() => deletes.length).toBe(2);
  await expect.poll(() => rows.map((r) => r.item).sort()).toEqual(['1 kg potatoes', '3 onions', 'Coffee']);
  await expect(page.getByText('3 onions')).toHaveCount(1);
  await expect(page.getByText('Coffee')).toHaveCount(1);
});

test('the field and its button fit a 360 px phone', async ({ page }) => {
  await openShopping(page);
  await page.setViewportSize({ width: 360, height: 740 });
  const field = await page.getByLabel('Add an item to the shopping list').boundingBox();
  const button = await page.getByRole('button', { name: 'Add', exact: true }).boundingBox();
  expect(field!.x).toBeGreaterThanOrEqual(0);
  expect(button!.x + button!.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
