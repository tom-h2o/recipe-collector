import { test, expect, type Page } from '@playwright/test';
import { installMockBackend, MOCK_RECIPES, MOCK_USER } from './support/mockBackend';
import { openAdmin } from './support/nav';

/**
 * Admin → Recipes: the list, and someone's recipe opened from it. The recipe
 * used to open as the public share page inside a dark overlay, so it ended
 * with the pitch written for strangers ("Someone sent you this… Create a free
 * account"). It is now drawn like the recipe drawer, from the same parts, with
 * the edit form nested inside it.
 */

const OWNER = 'anna@example.com';
const PIZZA = {
  ...MOCK_RECIPES[0],
  user_id: 'someone-else',
  source_url: 'https://www.example.com/pizza',
  prep_time_mins: 20,
  cook_time_mins: 12,
  instructions: 'Mix the dough and let it rise.\nStretch it thin.\nBake at 250C for 8 minutes.',
  notes: 'Private: grandma says more basil.',
};

async function openRecipes(page: Page, viewport = { width: 1280, height: 900 }) {
  await page.setViewportSize(viewport);
  await installMockBackend(page);
  const patches: Record<string, unknown>[] = [];
  const tagCalls: Record<string, unknown>[] = [];
  let current = { ...PIZZA };

  await page.route((u) => u.pathname === '/api/account' && u.searchParams.get('tab') === 'recipes', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recipes: [
          { ...current, user_email: OWNER },
          { ...MOCK_RECIPES[1], user_id: MOCK_USER.id, user_email: MOCK_USER.email },
        ],
        total: 2,
      }),
    }));
  await page.route((u) => u.pathname === '/api/account' && u.searchParams.has('recipeId'), async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patches.push(body);
      current = { ...current, ...body };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recipe: current, user_email: OWNER }) });
  });
  await page.route((u) => u.pathname === '/api/tag', async (route) => {
    tagCalls.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tags: ['Italian', 'Dinner'] }) });
  });

  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza').first()).toBeVisible();
  await openAdmin(page);
  await page.getByRole('tab', { name: /Recipes/ }).click();
  const list = page.getByRole('list', { name: 'Recipes' });
  await expect(list.getByRole('button', { name: /Avocado Toast/ })).toBeVisible();
  return { list, patches, tagCalls };
}

test('opens someone\'s recipe like the recipe drawer, without the pitch to strangers', async ({ page }) => {
  const { list } = await openRecipes(page);

  // Each row is a button, so it can be reached and opened from the keyboard.
  await expect(list.getByRole('button', { name: /Classic Margherita Pizza/ })).toContainText(OWNER);
  await list.getByRole('button', { name: /Classic Margherita Pizza/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Classic Margherita Pizza' })).toBeVisible();
  await expect(dialog).toContainText(`Belongs to ${OWNER}`);
  await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Regenerate tags' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Regenerate nutrition' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Ingredients' })).toBeVisible();
  await expect(dialog.getByText('Stretch it thin.')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'example.com' })).toHaveAttribute('href', PIZZA.source_url);

  // What the public page says to a guest has no place here, nor does Cook.
  await expect(page.getByText(/Someone sent you this/)).toHaveCount(0);
  await expect(page.getByText('Create a free account')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Cook' })).toHaveCount(0);
  // Nor the owner's private notes.
  await expect(page.getByText(/grandma says more basil/)).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Close recipe' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the edit form opens on top of the recipe and closes back to it', async ({ page }) => {
  const { list, patches } = await openRecipes(page);
  await list.getByRole('button', { name: /Classic Margherita Pizza/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const title = page.getByRole('textbox', { name: 'Title' });
  await expect(title).toHaveValue('Classic Margherita Pizza');

  // Escape closes the form only; the recipe is still there.
  await page.keyboard.press('Escape');
  await expect(title).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Classic Margherita Pizza' })).toBeVisible();
  expect(patches).toHaveLength(0);

  // Saving writes to the owner's recipe and the view shows the change.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await title.fill('Margherita, Naples style');
  await page.getByRole('button', { name: 'Update Recipe' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Margherita, Naples style' })).toBeVisible();
  expect(patches.at(-1)).toMatchObject({ title: 'Margherita, Naples style' });
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveCount(0);
});

test('regenerating the tags shows the new ones', async ({ page }) => {
  const { list, tagCalls } = await openRecipes(page);
  await list.getByRole('button', { name: /Classic Margherita Pizza/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Regenerate tags' }).click();
  await expect(dialog.getByText('Dinner', { exact: true })).toBeVisible();
  expect(tagCalls[0]).toMatchObject({ recipeId: PIZZA.id, title: PIZZA.title });
});

test('the list and the recipe fit a phone without scrolling sideways', async ({ page }) => {
  const { list } = await openRecipes(page, { width: 375, height: 812 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  // The owner's address is on the row itself, not in a column off the screen.
  await expect(list.getByText(new RegExp(OWNER))).toBeInViewport();

  await list.getByRole('button', { name: /Classic Margherita Pizza/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Regenerate nutrition' })).toBeInViewport();
  // Measured once the dialog has finished opening: until then it is still
  // moving into place, and a box read mid-way lies partly off the screen
  // (as safeArea.spec.ts found for every dialog).
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});

test('the recipes of one person, from the Users tab, and back to everyone', async ({ page }) => {
  await openRecipes(page);
  await page.getByRole('tab', { name: /Users/ }).click();
  await page.getByRole('button', { name: '2', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Recipes/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(MOCK_USER.email, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: "Show everyone's recipes" }).click();
  await expect(page.getByRole('button', { name: "Show everyone's recipes" })).toHaveCount(0);
});
