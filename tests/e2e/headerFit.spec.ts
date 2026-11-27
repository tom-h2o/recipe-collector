import { test, expect, type Page } from '@playwright/test';
import { installMockBackend, MOCK_RECIPES } from './support/mockBackend';

/**
 * The header fits inside the margins the page content uses, at every width.
 *
 * On a phone: the name and five round buttons (Suggest, theme, Settings, Add
 * recipe, the account menu) in the 328 px a 360 px screen leaves inside the
 * page margins. It was 18 px too wide, which pushed every view 2 px past the
 * screen, so the whole app could be dragged sideways.
 *
 * On a desktop (from lg, 1024 px) the tabs sit between the name and the
 * buttons, in a row that stops growing at 1152 px (1072 px inside the
 * margins). The admin's fifth tab and the counts on Vault and Inbox are what
 * make it tight. With wider tabs from xl and a labelled Suggest button, the
 * admin's header ran 63 px past the margin from 1280 px, and with a full
 * vault and inbox 102 px there and 47 px at 1024, where the page scrolled.
 *
 * Checked against the header's content box, not only the page's scroll
 * width: the side margins hid most of these, and at 375 px the buttons ran
 * 3 px into the margin while the page itself still fitted.
 *
 * The admin and everyone else are both checked: on a phone their headers are
 * the same (the admin's extra tab is in the bottom bar), so an admin-only
 * control added later cannot break it unnoticed.
 */

const CONTROLS: (string | RegExp)[] = [
  // "Suggest a recipe" (its title) as an icon, "Suggest" (its label) from sm to lg.
  /^Suggest/,
  /^Switch to (dark|light) mode$/,
  'Settings',
  'Add recipe',
  /^Account menu/,
];

/** The desktop tabs; Vault and Inbox carry a count after the label. */
const TABS: RegExp[] = [/^Vault/, /Planner$/, /^Shopping$/, /^Inbox/];

const WHO = [
  { name: 'the admin', email: undefined },
  { name: 'everyone else', email: 'cook@example.com' },
] as const;

/**
 * The widest the tabs get: a three-digit Vault (the count is the recipes
 * loaded so far, 24 a page) and a two-digit Inbox.
 */
async function fillVaultAndInbox(page: Page) {
  const recipes = Array.from({ length: 120 }, (_, i) => ({ ...MOCK_RECIPES[i % MOCK_RECIPES.length], id: `recipe-${i}` }));
  await page.route('**/rest/v1/recipes?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(recipes) }));
  const shares = Array.from({ length: 12 }, (_, i) => ({
    id: `share-${i}`, recipe_id: 'recipe-a', recipe_title: 'Classic Margherita Pizza',
    sender_email: 'friend@example.com', recipient_email: 'test@example.com',
    status: 'pending', created_at: new Date().toISOString(),
  }));
  await page.route('**/rest/v1/recipe_shares?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(shares) }));
}

async function open(page: Page, width: number, { email, full = false }: { email?: string; full?: boolean } = {}) {
  await page.setViewportSize({ width, height: 780 });
  await installMockBackend(page, email ? { email } : {});
  if (full) await fillVaultAndInbox(page);
  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza').first()).toBeVisible();
  // Wait for the server's answer on who is the admin, so the header and the
  // bottom bar are in their final state.
  const adminTab = page.getByRole('button', { name: /^Admin$/ }).filter({ visible: true });
  if (email) await expect(adminTab).toHaveCount(0);
  else await expect(adminTab).toHaveCount(1);
  // Newsreader is what the name is measured in; a fallback serif is narrower.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** The header row's content box: where the page content's margins are. */
async function contentBox(page: Page) {
  return page.locator('header > div').evaluate((row) => {
    const box = row.getBoundingClientRect();
    const style = getComputedStyle(row);
    return { left: box.left + parseFloat(style.paddingLeft), right: box.right - parseFloat(style.paddingRight) };
  });
}

/** Every header control in full, inside the margins the page content uses. */
async function expectHeaderFits(page: Page, tabs: RegExp[] = []) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);

  const header = page.locator('header');
  const { left, right } = await contentBox(page);

  let lastRight = 0;
  for (const name of CONTROLS) {
    const control = header.getByRole('button', { name });
    await expect(control).toBeVisible();
    const box = (await control.boundingBox())!;
    // 36 px is what they are on a phone; none may shrink to make room.
    expect(box.width, `${name} is narrower than 36 px`).toBeGreaterThanOrEqual(36);
    expect(box.height, `${name} is shorter than 36 px`).toBeGreaterThanOrEqual(36);
    expect(box.x, `${name} starts in the left margin`).toBeGreaterThanOrEqual(left - 0.5);
    expect(box.x + box.width, `${name} runs into the right margin`).toBeLessThanOrEqual(right + 0.5);
    lastRight = Math.max(lastRight, box.x + box.width);
  }
  // Flush with the margin, as the logo is on the left. The hidden desktop tabs
  // once left an empty grid column whose gap held the buttons 8 px short.
  expect(lastRight).toBeCloseTo(right, 0);

  for (const name of tabs) {
    const tab = header.getByRole('button', { name });
    await expect(tab).toBeVisible();
    const box = (await tab.boundingBox())!;
    expect(box.x, `the ${name} tab starts in the left margin`).toBeGreaterThanOrEqual(left - 0.5);
    expect(box.x + box.width, `the ${name} tab runs into the right margin`).toBeLessThanOrEqual(right + 0.5);
  }
}

async function expectNameInFull(page: Page) {
  const name = page.locator('header h1');
  await expect(name).toHaveText('Speisekammer');
  expect(await name.evaluate((h) => h.scrollWidth <= h.clientWidth), 'the name is cut short').toBe(true);
}

for (const who of WHO) {
  test(`at 360 px the header fits, for ${who.name}`, async ({ page }) => {
    await open(page, 360, { email: who.email });
    await expectHeaderFits(page);
    await expectNameInFull(page);
  });
}

test('at 360 px the header fits on the admin dashboard too', async ({ page }) => {
  await open(page, 360);
  await page.getByRole('navigation').getByRole('button', { name: 'Admin' }).click();
  await expect(page.getByText('Admin Dashboard')).toBeVisible();
  await expectHeaderFits(page);
});

test('at 320 px (Display Zoom) the name is cut short, not the page', async ({ page }) => {
  await open(page, 320);
  await expectHeaderFits(page);
  await expect(page.locator('header h1')).toBeVisible();
});

test('from 640 px the buttons line up with the right margin', async ({ page }) => {
  await open(page, 768);
  await expectHeaderFits(page);
});

for (const who of WHO) {
  for (const full of [false, true]) {
    test(`from 1024 px the tabs and buttons fit, for ${who.name}, ${full ? 'with a full vault and inbox' : 'with a few recipes'}`, async ({ page }) => {
      await open(page, 1024, { email: who.email, full });
      if (full) {
        await expect(page.locator('header').getByRole('button', { name: /^Vault/ })).toContainText('120');
        await expect(page.locator('header').getByRole('button', { name: /^Inbox/ })).toContainText('12');
      }
      const tabs = who.email ? TABS : [...TABS, /^Admin$/];
      // 1024 is the narrowest box; from 1152 it stays 1072 px, and 1280 is
      // where the longer labels and wider tabs start.
      for (const width of [1024, 1280, 1440]) {
        await test.step(`${width} px`, async () => {
          await page.setViewportSize({ width, height: 780 });
          await expectHeaderFits(page, tabs);
          await expectNameInFull(page);
        });
      }
    });
  }
}
