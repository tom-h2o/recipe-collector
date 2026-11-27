import { test, expect, type Page } from '@playwright/test';
import { installMockBackend, MOCK_RECIPES } from './support/mockBackend';
import { openAdmin } from './support/nav';

/**
 * The header fits inside the margins the page content uses, at every width,
 * and so does the phone's bottom bar.
 *
 * On a phone the header is the name and two round buttons: Suggest and Add
 * recipe. It used to carry five (also light/dark, Settings and the account),
 * which only fitted a 360 px screen with no gaps between them and a smaller
 * name. Those three are entries of the account list now, which the bottom
 * bar's last tab ("You") opens; the admin dashboard is an entry there too,
 * so the admin's bars are the same as everyone's.
 *
 * On a desktop (from lg, 1024 px) the tabs sit between the name and the
 * buttons, in a row that stops growing at 1152 px (1072 px inside the
 * margins), and the account's avatar is the last control on the right.
 *
 * Checked against the header's content box, not only the page's scroll
 * width: the side margins hid most earlier faults, and at 375 px the buttons
 * once ran 3 px into the margin while the page itself still fitted.
 */

const PHONE_CONTROLS: (string | RegExp)[] = [
  // "Suggest a recipe" as an icon; "Suggest" is its label from sm to lg.
  /^Suggest/,
  'Add recipe',
];
/** From lg the avatar joins them, top right. */
const DESKTOP_CONTROLS: (string | RegExp)[] = [...PHONE_CONTROLS, /^Account menu/];

/** The desktop tabs; Inbox carries a count after the label. */
const TABS: RegExp[] = [/^Vault/, /Planner$/, /^Shopping$/, /^Inbox/];

const WHO = [
  { name: 'the admin', email: undefined },
  { name: 'everyone else', email: 'cook@example.com' },
] as const;

/** The widest the tabs get: a two-digit Inbox. (The Vault tab no longer counts.) */
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
  const controls = (page.viewportSize()?.width ?? 0) >= 1024 ? DESKTOP_CONTROLS : PHONE_CONTROLS;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);

  const header = page.locator('header');
  const { left, right } = await contentBox(page);

  let lastRight = 0;
  for (const name of controls) {
    const control = header.getByRole('button', { name });
    await expect(control).toBeVisible();
    const box = (await control.boundingBox())!;
    // 40 px across at every width; none may shrink to make room.
    expect(box.width, `${name} is narrower than 40 px`).toBeGreaterThanOrEqual(40);
    expect(box.height, `${name} is shorter than 40 px`).toBeGreaterThanOrEqual(40);
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
  await openAdmin(page);
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
        await expect(page.locator('header').getByRole('button', { name: /^Inbox/ })).toContainText('12');
        // The number of recipes loaded so far is not a count of anything to do.
        await expect(page.locator('header').getByRole('button', { name: /^Vault/ })).toHaveText('Vault');
      }
      // The admin dashboard is in the account list, not a tab.
      await expect(page.locator('header').getByRole('button', { name: /^Admin$/ })).toHaveCount(0);
      const tabs = TABS;
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

for (const who of WHO) {
  test(`the phone's bottom bar has the same five tabs for ${who.name}, each wide enough for a thumb`, async ({ page }) => {
    await open(page, 320, { email: who.email });
    const bar = page.getByRole('navigation');
    const tabs = bar.getByRole('button');
    await expect(tabs).toHaveText(['Vault', 'Planner', 'Shopping', 'Inbox', /You$/]);
    for (const box of await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as { x: number; width: number; height: number }))) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
  });
}

