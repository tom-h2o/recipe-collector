import { test, expect, type Locator, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';
import { openAccount } from './support/nav';

/**
 * What makes the app feel like one on a phone, each from a report by its
 * owner on an iPhone:
 *
 *  - Typing zoomed the page in (iOS does that for any field under 16 px) and
 *    left the top bar's buttons off screen.
 *  - A sheet could only be closed by its small ✕, not by pulling it down.
 *  - A tab in the bottom bar sometimes needed a second tap.
 *
 * Run as a touch device, which is what `(pointer: coarse)` in index.css and
 * the tabs' pointer handling look at.
 */
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

async function open(page: Page) {
  await installMockBackend(page);
  await page.goto('/');
  await expect(page.locator('.recipe-card').first()).toBeVisible();
}

const settle = (page: Page) => page.evaluate(() =>
  Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));

/** Every text field on screen, with the size of its text. */
const fieldSizes = (page: Page) => page.evaluate(() =>
  Array.from(document.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), textarea, select'))
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => ({ field: el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.id ?? el.tagName, px: parseFloat(getComputedStyle(el).fontSize) })));

async function expectNoZoom(page: Page, where: string, atLeast = 1) {
  const fields = await fieldSizes(page);
  expect(fields.length, `${where}: no field found`).toBeGreaterThanOrEqual(atLeast);
  for (const { field, px } of fields) expect(px, `${where}: "${field}" would make an iPhone zoom in`).toBeGreaterThanOrEqual(16);
}

test.describe('typing does not zoom the page', () => {
  test('the sign-in screen', async ({ page }) => {
    await installMockBackend(page, { signedIn: false });
    await page.goto('/');
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expectNoZoom(page, 'sign-in', 2);
  });

  test('the vault, the shopping list and the planner', async ({ page }) => {
    await open(page);
    await expectNoZoom(page, 'vault');
    await page.getByRole('navigation').getByRole('button', { name: 'Shopping' }).click();
    await expect(page.getByLabel('Add an item to the shopping list')).toBeVisible();
    await expectNoZoom(page, 'shopping');
  });

  test('the sheets and dialogs', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Suggest a recipe' }).click();
    await expect(page.getByRole('dialog', { name: 'What can I cook?' })).toBeVisible();
    await expectNoZoom(page, 'suggest');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'New collection' }).click();
    await expect(page.getByRole('dialog', { name: 'New collection' })).toBeVisible();
    await expectNoZoom(page, 'new collection');
    await page.keyboard.press('Escape');

    await openAccount(page);
    await page.getByRole('button', { name: 'Send feedback' }).click();
    await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeVisible();
    await expectNoZoom(page, 'feedback');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Add recipe' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /manually/i }).click();
    await expectNoZoom(page, 'recipe editor', 3);
  });

  test('with a mouse, fields keep their own size', async ({ browser }) => {
    // The rule is for touch devices only; a desktop keeps its denser fields.
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
    const page = await context.newPage();
    await open(page);
    expect((await fieldSizes(page)).some((f) => f.px < 16)).toBe(true);
    await context.close();
  });
});

/** Presses on the sheet's grab zone and drags down by `distance`, slowly enough not to count as a flick. */
async function pull(page: Page, sheet: Locator, distance: number) {
  const grab = sheet.locator('[data-sheet-grab]');
  const box = (await grab.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let moved = 10; moved <= distance; moved += 10) {
    await page.mouse.move(x, y + moved);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
}

test.describe('a sheet is closed by pulling it down', () => {
  test('pulled far enough it closes; pulled a little it settles back', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet).toBeVisible();
    await settle(page);
    const before = (await sheet.boundingBox())!.y;

    await pull(page, sheet, 40);
    await expect(sheet).toBeVisible();
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.y)).toBe(Math.round(before));

    await pull(page, sheet, 160);
    await expect(sheet).toHaveCount(0);
    // Only the sheet went: the vault is still there.
    await expect(page.locator('.recipe-card').first()).toBeVisible();
  });

  test('it follows the finger on the way', async ({ page }) => {
    await open(page);
    await openAccount(page);
    const sheet = page.getByRole('dialog', { name: 'You' });
    await settle(page);
    const before = (await sheet.boundingBox())!.y;
    const grab = (await sheet.locator('[data-sheet-grab]').boundingBox())!;
    await page.mouse.move(grab.x + 60, grab.y + 8);
    await page.mouse.down();
    await page.mouse.move(grab.x + 60, grab.y + 58, { steps: 5 });
    expect(Math.round((await sheet.boundingBox())!.y - before)).toBe(50);
    // Upwards it does not lift off the bottom edge.
    await page.mouse.move(grab.x + 60, grab.y - 40, { steps: 5 });
    expect(Math.round((await sheet.boundingBox())!.y - before)).toBe(0);
    await page.mouse.up();
    await expect(sheet).toBeVisible();
  });

  test('its ✕ still works, and its content is not a grab zone', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await settle(page);
    // Dragging on the tags is scrolling, not closing.
    const tag = (await sheet.getByRole('button', { name: 'Vegan', exact: true }).boundingBox())!;
    await page.mouse.move(tag.x + 4, tag.y - 6);
    await page.mouse.down();
    await page.mouse.move(tag.x + 4, tag.y + 200, { steps: 8 });
    await page.mouse.up();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
  });

  test('cook mode\'s ingredient list too', async ({ page }) => {
    await open(page);
    await page.locator('.recipe-card').first().getByText('Classic Margherita Pizza').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cook', exact: true }).click();
    await page.getByRole('button', { name: 'Show ingredients' }).click();
    const list = page.getByRole('region', { name: 'Ingredients' });
    await expect(list).toBeVisible();
    await pull(page, list, 160);
    await expect(list).toHaveCount(0);
    // Cook mode itself stays open.
    await expect(page.getByRole('button', { name: 'Exit cook mode' })).toBeVisible();
  });

  test('on a computer a centred dialog is not pulled', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
    const page = await context.newPage();
    await open(page);
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await settle(page);
    const before = (await sheet.boundingBox())!.y;
    await pull(page, sheet, 160);
    await expect(sheet).toBeVisible();
    expect(Math.round((await sheet.boundingBox())!.y)).toBe(Math.round(before));
    await context.close();
  });
});

test.describe('the bottom bar reacts to the first touch', () => {
  test('a tab switches the view as the finger lands, before any click', async ({ page }) => {
    await open(page);
    const tab = page.getByRole('navigation').getByRole('button', { name: 'Shopping' });
    // What iOS delivers for a tap made while the page is still gliding after
    // a flick: the touch, and no click.
    await tab.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, bubbles: true, button: 0 });
    await expect(tab).toHaveAttribute('aria-current', 'page');
    await expect(page.getByLabel('Add an item to the shopping list')).toBeVisible();
  });

  test('a mouse press alone changes nothing: the click does', async ({ page }) => {
    await open(page);
    const tab = page.getByRole('navigation').getByRole('button', { name: 'Shopping' });
    await tab.dispatchEvent('pointerdown', { pointerType: 'mouse', isPrimary: true, bubbles: true, button: 0 });
    await expect(tab).not.toHaveAttribute('aria-current', 'page');
    await tab.click();
    await expect(tab).toHaveAttribute('aria-current', 'page');
  });

  test('a pressed tab fades but does not shrink under the finger', async ({ page }) => {
    await open(page);
    for (const tab of await page.getByRole('navigation').getByRole('button').all()) {
      await expect(tab).toHaveAttribute('data-pressable', 'surface');
    }
  });

  test('the page does not wait to see whether a tap becomes a double-tap', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe('manipulation');
  });
});
