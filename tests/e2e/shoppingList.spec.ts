import { test, expect, type Page } from '@playwright/test';
import { installMockBackend, MOCK_RECIPES, MOCK_USER } from './support/mockBackend';

/**
 * The shopping page: the meals a list is built from (a basket: each can be
 * left off and given its own portions), the list, and what a person adds
 * themselves, which "Create list" keeps.
 *
 * The tables here behave like tables: list rows are stored and filtered
 * deletes remove what they match; plan entries keep the portions and ticks
 * written to them.
 */
interface Row { id: string; item: string; category: string | null; is_checked: boolean; from_plan: boolean }
interface Plan { id: string; date: string; meal_type: string; recipe_id: string; recipe: unknown; user_id: string; servings: number | null; in_shopping: boolean }

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Four servings, amounts that scale. */
const STEW = {
  ...MOCK_RECIPES[0], id: 'recipe-stew', title: 'Kartoffeleintopf', servings: 4, original_servings: 4,
  ingredients: [{ amount: '800 g', name: 'Kartoffeln', details: '' }, { amount: '2', name: 'Zwiebeln', details: '' }],
};
const TOAST = { ...MOCK_RECIPES[1], servings: 1, original_servings: 1, ingredients: [{ amount: '2 slices', name: 'bread', details: '' }] };

async function openShopping(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await installMockBackend(page);
  const rows: Row[] = [];
  const deletes: string[] = [];
  const sent: { ingredients: string[] }[] = [];
  let nextId = 1;
  const plans: Plan[] = [
    { id: 'plan-today', date: day(0), meal_type: 'Dinner', recipe_id: STEW.id, recipe: STEW, user_id: MOCK_USER.id, servings: null, in_shopping: true },
    { id: 'plan-toast', date: day(2), meal_type: 'Breakfast', recipe_id: TOAST.id, recipe: TOAST, user_id: MOCK_USER.id, servings: null, in_shopping: true },
    { id: 'plan-far', date: day(12), meal_type: 'Dinner', recipe_id: STEW.id, recipe: STEW, user_id: MOCK_USER.id, servings: null, in_shopping: true },
  ];

  await page.route('**/rest/v1/shopping_list*', async (route) => {
    const request = route.request();
    const url = decodeURIComponent(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const id = new URL(request.url()).searchParams.get('id')?.replace('eq.', '');
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Partial<Row> | Partial<Row>[];
      const made = (Array.isArray(body) ? body : [body]).map((r) => ({
        id: `item-${nextId++}`, item: r.item ?? '', category: r.category ?? null, is_checked: false, from_plan: r.from_plan ?? false,
      }));
      rows.push(...made);
      // `.select().single()` asks for the one row as an object.
      return json(request.headers()['accept']?.includes('vnd.pgrst.object') ? made[0] : made, 201);
    }
    if (request.method() === 'PATCH') {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, request.postDataJSON());
      return json([]);
    }
    if (request.method() === 'DELETE') {
      deletes.push(url);
      const onlyGenerated = url.includes('from_plan=eq.true');
      for (let i = rows.length - 1; i >= 0; i--) {
        if (id ? rows[i].id === id : (!onlyGenerated || rows[i].from_plan)) rows.splice(i, 1);
      }
      return json([]);
    }
    return json(rows);
  });

  await page.route('**/rest/v1/meal_plan*', (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const id = new URL(request.url()).searchParams.get('id')?.replace('eq.', '');
      const plan = plans.find((p) => p.id === id);
      if (plan) Object.assign(plan, request.postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(plan ? [{ id }] : []) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(plans) });
  });
  await page.route('**/api/shopping', (route) => {
    sent.push(route.request().postDataJSON() as { ingredients: string[] });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ list: [{ category: 'Produce', items: ['3 onions', '1 kg potatoes'] }] }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Shopping' }).filter({ visible: true }).first().click();
  await expect(page.getByText('Your shopping list is empty.')).toBeVisible();
  const basket = page.getByRole('region', { name: 'Meals for this list' });
  return { rows, deletes, plans, sent, basket };
}

test('the meals the list is for are shown first: today and the next seven days, in order', async ({ page }) => {
  const { basket } = await openShopping(page);
  // Today's dinner counts (compared as moments it was "past" by the morning);
  // what is planned twelve days out does not.
  await expect(basket.getByRole('checkbox')).toHaveCount(2);
  await expect(basket.getByRole('listitem')).toHaveText([/Kartoffeleintopf/, /Avocado Toast/]);
  await expect(basket).toContainText('2 of 2 chosen');
  // Each with the portions the recipe is written for.
  await expect(basket.getByRole('group', { name: 'Portions of Kartoffeleintopf' })).toContainText('4');
  await expect(basket.getByRole('group', { name: 'Portions of Avocado Toast' })).toContainText('1');
});

test('the list is made from the ticked meals, at their portions', async ({ page }) => {
  const { basket, plans, sent } = await openShopping(page);

  // Cooking the four-serving stew for two, and leaving the toast off.
  const stew = basket.getByRole('group', { name: 'Portions of Kartoffeleintopf' });
  await stew.getByRole('button', { name: 'One portion fewer' }).click();
  await stew.getByRole('button', { name: 'One portion fewer' }).click();
  await expect(stew).toContainText('2');
  await basket.getByRole('checkbox', { name: 'Avocado Toast on the list' }).click();
  await expect(basket).toContainText('1 of 2 chosen');
  // Saved on the plan entries, so the planner and other devices see them.
  await expect.poll(() => plans.find((p) => p.id === 'plan-today')?.servings).toBe(2);
  await expect.poll(() => plans.find((p) => p.id === 'plan-toast')?.in_shopping).toBe(false);

  await basket.getByRole('button', { name: 'Create list' }).click();
  await expect(page.getByText('3 onions')).toBeVisible();
  expect(sent).toEqual([{ ingredients: ['400 g Kartoffeln', '1 Zwiebeln'] }]);
});

test('after a change to the meals, the page says so and offers to update', async ({ page }) => {
  const { basket, sent } = await openShopping(page);
  await basket.getByRole('button', { name: 'Create list' }).click();
  await expect(basket.getByRole('status')).toHaveText('The list matches these meals.');

  await basket.getByRole('group', { name: 'Portions of Avocado Toast' }).getByRole('button', { name: 'One portion more' }).click();
  await expect(basket.getByRole('status')).toHaveText('The meals have changed since the list was made.');
  // Nothing was regenerated by itself: that would cost an AI call per tap.
  expect(sent).toHaveLength(1);

  await basket.getByRole('button', { name: 'Update list' }).click();
  await expect(basket.getByRole('status')).toHaveText('The list matches these meals.');
  expect(sent).toHaveLength(2);
  expect(sent[1].ingredients).toContain('4 slices bread');
});

test('with no meal ticked there is nothing to make a list from', async ({ page }) => {
  const { basket, sent } = await openShopping(page);
  await basket.getByRole('checkbox', { name: 'Kartoffeleintopf on the list' }).click();
  await basket.getByRole('checkbox', { name: 'Avocado Toast on the list' }).click();
  await expect(basket.getByRole('button', { name: 'Create list' })).toBeDisabled();
  await expect(basket.getByRole('status')).toContainText('Tick at least one meal');
  expect(sent).toEqual([]);
});

test('an item can be typed in, and making the list from the meals keeps it', async ({ page }) => {
  const { rows, deletes, basket } = await openShopping(page);

  await page.getByLabel('Add an item to the shopping list').fill('Coffee');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Coffee')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your items' })).toBeVisible();
  expect(rows).toMatchObject([{ item: 'Coffee', from_plan: false }]);

  await basket.getByRole('button', { name: 'Create list' }).click();
  await expect(page.getByText('3 onions')).toBeVisible();
  await expect(page.getByText('Coffee')).toBeVisible();
  await expect(page.getByText('Your own item was kept')).toBeVisible();
  // The delete named the generated rows; it did not empty the list.
  expect(deletes).toHaveLength(1);
  expect(deletes[0]).toContain('from_plan=eq.true');

  // Updating replaces the generated items instead of doubling them.
  await basket.getByRole('button', { name: 'Update list' }).click();
  await expect.poll(() => deletes.length).toBe(2);
  await expect.poll(() => rows.map((r) => r.item).sort()).toEqual(['1 kg potatoes', '3 onions', 'Coffee']);
  await expect(page.getByText('3 onions')).toHaveCount(1);
  await expect(page.getByText('Coffee')).toHaveCount(1);
});

test('a bought item moves to Done, can be put back, and done items can be removed together', async ({ page }) => {
  const { rows, basket } = await openShopping(page);
  await basket.getByRole('button', { name: 'Create list' }).click();
  const onions = page.getByRole('checkbox', { name: '3 onions' });
  await onions.click();

  const done = page.locator('section', { has: page.getByRole('heading', { name: /^Done/ }) });
  await expect(done.getByRole('checkbox', { name: '3 onions' })).toHaveAttribute('aria-checked', 'true');
  // Still to buy: only the potatoes are left under Produce.
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Produce' }) }).getByRole('checkbox')).toHaveCount(1);
  await expect.poll(() => rows.find((r) => r.item === '3 onions')?.is_checked).toBe(true);

  await done.getByRole('checkbox', { name: '3 onions' }).click();
  await expect(done).toHaveCount(0);

  await page.getByRole('checkbox', { name: '3 onions' }).click();
  await done.getByRole('button', { name: 'Remove done items' }).click();
  await expect.poll(() => rows.map((r) => r.item)).toEqual(['1 kg potatoes']);
});

test('clearing the whole list asks first', async ({ page }) => {
  const { rows, basket } = await openShopping(page);
  await basket.getByRole('button', { name: 'Create list' }).click();
  await expect(page.getByText('3 onions')).toBeVisible();

  await page.getByRole('button', { name: 'Clear the whole list' }).click();
  const confirm = page.getByRole('dialog', { name: 'Clear the whole list?' });
  await expect(confirm).toContainText('all 2 items');
  await confirm.getByRole('button', { name: 'Keep it' }).click();
  expect(rows).toHaveLength(2);

  await page.getByRole('button', { name: 'Clear the whole list' }).click();
  await confirm.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText('Your shopping list is empty.')).toBeVisible();
  expect(rows).toHaveLength(0);
  // With nothing generated left, it is "Create list" again.
  await expect(basket.getByRole('button', { name: 'Create list' })).toBeVisible();
});

test('the page fits a 360 px phone, and its controls are big enough for a thumb', async ({ page }) => {
  const { basket } = await openShopping(page, 360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  for (const control of await basket.getByRole('button').all()) {
    const box = (await control.boundingBox())!;
    expect(box.x, 'starts on screen').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, 'ends on screen').toBeLessThanOrEqual(360);
    expect(box.height).toBeGreaterThanOrEqual(36);
  }
  const field = (await page.getByLabel('Add an item to the shopping list').boundingBox())!;
  const add = (await page.getByRole('button', { name: 'Add', exact: true }).boundingBox())!;
  expect(field.x).toBeGreaterThanOrEqual(0);
  expect(add.x + add.width).toBeLessThanOrEqual(360);
});

test('the planner shows each meal\'s portions and can change them', async ({ page }) => {
  const { plans } = await openShopping(page);
  await page.getByRole('navigation').getByRole('button', { name: 'Planner' }).click();
  await page.getByRole('button', { name: '4 portions of Kartoffeleintopf: change' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Portions' });
  await expect(sheet).toContainText('The recipe is written for 4');
  await sheet.getByRole('button', { name: 'One portion more' }).click();
  await sheet.getByRole('button', { name: 'One portion more' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: '6 portions of Kartoffeleintopf: change' }).first()).toBeVisible();
  expect(plans.find((p) => p.id === 'plan-today')?.servings).toBe(6);
});
