import { test, expect, type Page } from '@playwright/test';
import { installMockBackend } from './support/mockBackend';

/**
 * The glass surfaces, the sliding tab pill and the touch feedback — and above
 * all the three situations in which they must step back: a reader who has
 * asked for less transparency, one who has asked for less motion, and a
 * browser that cannot blur.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function open(page: Page, viewport = PHONE) {
  await page.setViewportSize(viewport);
  await installMockBackend(page);
  await page.goto('/');
  await expect(page.getByText('Classic Margherita Pizza')).toBeVisible();
}

/** Lets the pill finish sliding before anything is measured. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => undefined));
}

const style = (page: Page, selector: string, properties: string[]) =>
  page.locator(selector).first().evaluate((el, props) => {
    const computed = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, computed.getPropertyValue(p)]));
  }, properties);

/** The alpha of a computed colour: "rgba(250, 249, 245, 0.62)" → 0.62, "rgb(…)" → 1. */
function alpha(color: string): number {
  const parts = color.match(/[\d.]+/g) ?? [];
  return parts.length >= 4 ? Number(parts[3]) : 1;
}

test.describe('the phone tab bar', () => {
  test('floats as a capsule clear of the screen edges', async ({ page }) => {
    await open(page);
    const bar = page.locator('nav .glass');
    const box = (await bar.boundingBox())!;

    expect(box.x).toBeGreaterThan(8);
    expect(box.x + box.width).toBeLessThan(PHONE.width - 8);
    expect(box.y + box.height).toBeLessThan(PHONE.height - 8);
    // A capsule: fully rounded ends.
    const radius = await bar.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
    expect(radius).toBeGreaterThanOrEqual(box.height / 2);
  });

  test('the pill sits under the current tab and slides to the one chosen', async ({ page }) => {
    await open(page);
    const nav = page.getByRole('navigation');
    const pill = nav.locator('.tab-pill');
    await settle(page);

    const under = async (name: string) => {
      const tab = (await nav.getByRole('button', { name }).boundingBox())!;
      const at = (await pill.boundingBox())!;
      expect(Math.abs(at.x - tab.x)).toBeLessThan(2);
      expect(Math.abs(at.width - tab.width)).toBeLessThan(2);
    };

    await expect(nav.getByRole('button', { name: 'Vault' })).toHaveAttribute('aria-current', 'page');
    await under('Vault');

    await nav.getByRole('button', { name: 'Planner' }).click();
    await expect(nav.getByRole('button', { name: 'Planner' })).toHaveAttribute('aria-current', 'page');
    await settle(page);
    await under('Planner');
  });

  test('does not cover the end of the page', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = (await page.locator('footer').boundingBox())!;
    const bar = (await page.locator('nav .glass').boundingBox())!;
    // The last thing on the page can be scrolled clear of the bar.
    expect(footer.y + footer.height).toBeLessThanOrEqual(bar.y);
  });
});

test.describe('the desktop tab bar', () => {
  for (const width of [1024, 1280]) {
    test(`keeps every tab on one line and the header inside the window at ${width}px`, async ({ page }) => {
      await open(page, { width, height: 800 });
      const tabs = page.locator('header button').filter({ hasText: /Vault|Planner|Shopping|Inbox|Admin/ });
      for (const tab of await tabs.all()) {
        expect((await tab.boundingBox())!.height).toBeLessThan(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test('the pill follows the current tab', async ({ page }) => {
    await open(page, DESKTOP);
    const header = page.locator('header');
    await header.getByRole('button', { name: 'Shopping' }).click();
    await settle(page);

    const tab = (await header.getByRole('button', { name: 'Shopping' }).boundingBox())!;
    const pill = (await header.locator('.tab-pill').boundingBox())!;
    expect(Math.abs(pill.x - tab.x)).toBeLessThan(2);
    expect(Math.abs(pill.width - tab.width)).toBeLessThan(2);
  });
});

test.describe('glass', () => {
  test('is translucent and blurs what is behind it', async ({ page }) => {
    await open(page);
    const bar = await style(page, 'nav .glass', ['background-color', 'backdrop-filter']);
    expect(alpha(bar['background-color'])).toBeLessThan(1);
    expect(bar['backdrop-filter']).toContain('blur');
  });

  test('becomes solid when the reader has asked for less transparency', async ({ page }) => {
    // "Reduce transparency" on iOS and macOS. Playwright has no switch for it,
    // so the media feature is set through the browser's own protocol.
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    });
    await open(page);

    for (const selector of ['nav .glass', 'header.glass-bar']) {
      const surface = await style(page, selector, ['background-color', 'backdrop-filter']);
      expect(alpha(surface['background-color']), selector).toBe(1);
      expect(surface['backdrop-filter'], selector).toBe('none');
    }

    // The round button on a card's photo, which sets an alpha of its own.
    const star = await style(page, '.glass-control', ['background-color', 'backdrop-filter']);
    expect(alpha(star['background-color'])).toBe(1);
    expect(star['backdrop-filter']).toBe('none');

    // The menus and the smoked close button too.
    await page.getByText('Classic Margherita Pizza').click();
    const close = await style(page, '.glass-dark', ['background-color', 'backdrop-filter']);
    expect(alpha(close['background-color'])).toBe(1);
    expect(close['backdrop-filter']).toBe('none');
    await page.getByTitle('More options').click();
    const menu = await style(page, '.glass-menu', ['background-color', 'backdrop-filter']);
    expect(alpha(menu['background-color'])).toBe(1);
    expect(menu['backdrop-filter']).toBe('none');
  });

  test('has thickness: lit along the top, lifted off the page', async ({ page }) => {
    // Translucency alone reads as a pale sticker on a pale page. What makes
    // the bar look like glass is a rim of light, a sheen and a real shadow.
    await open(page);
    const bar = await style(page, 'nav .glass', ['box-shadow', 'background-image']);
    expect(bar['box-shadow']).toContain('inset');
    expect(bar['background-image']).toContain('linear-gradient');
    // More than one outer shadow: a tight one for contact and a wide one for height.
    expect(bar['box-shadow'].split('inset').length).toBeGreaterThanOrEqual(3);
  });

  test('the buttons that sit on a photo are glass', async ({ page }) => {
    await open(page);
    const star = await style(page, '[title="Favourite"], [title="Unfavourite"]', ['backdrop-filter', 'background-color']);
    expect(star['backdrop-filter']).toContain('blur');
    expect(alpha(star['background-color'])).toBeLessThan(1);

    await page.getByText('Classic Margherita Pizza').click();
    const close = await style(page, '[title="Close"]', ['backdrop-filter', 'background-color', 'color']);
    expect(close['backdrop-filter']).toContain('blur');
    expect(alpha(close['background-color'])).toBeLessThan(1);
    // Smoked, with a white cross: legible over a picture of any brightness.
    expect(close.color).toBe('rgb(255, 255, 255)');
  });
});

test.describe('touch feedback', () => {
  /** Presses and holds, so the pressed state can be read before release. */
  async function hold(page: Page, selector: string) {
    const box = (await page.locator(selector).first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  }

  test('a filter chip fades and gives way while held, and recovers after', async ({ page }) => {
    await open(page);
    const chip = 'button:has-text("Vegetarian")';
    await hold(page, chip);

    const held = await style(page, chip, ['opacity', 'scale']);
    expect(Number(held.opacity)).toBeCloseTo(0.6, 2);
    expect(held.scale).toBe('0.95');

    await page.mouse.up();
    await settle(page);
    const after = await style(page, chip, ['opacity', 'scale']);
    expect(after.opacity).toBe('1');
    expect(after.scale).toBe('none');
  });

  test('a primary button gets darker instead of paler', async ({ page }) => {
    await open(page);
    const add = 'button[aria-label="Add recipe"]';
    await hold(page, add);

    const held = await style(page, add, ['opacity', 'filter', 'scale']);
    expect(held.opacity).toBe('1');
    expect(held.filter).toBe('brightness(0.82)');
    expect(held.scale).toBe('0.95');
    await page.mouse.up();
  });

  test('a recipe card fades but does not shrink', async ({ page }) => {
    await open(page);
    const card = '[data-pressable="surface"]';
    // On the title: the favourite star and the tag chips on a card are
    // controls of their own and take the press themselves.
    const title = (await page.locator(card).first().getByText('Classic Margherita Pizza').boundingBox())!;
    await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
    await page.mouse.down();

    const held = await style(page, card, ['opacity', 'scale']);
    expect(Number(held.opacity)).toBeCloseTo(0.6, 2);
    expect(held.scale).toBe('none');
    await page.mouse.up();
  });

  test('with reduced motion nothing moves, but a tap is still acknowledged', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);

    const chip = 'button:has-text("Vegetarian")';
    await hold(page, chip);
    const held = await style(page, chip, ['opacity', 'scale']);
    // No giving way…
    expect(held.scale).toBe('none');
    // …but the colour change stays, or a tap would get no answer at all.
    expect(Number(held.opacity)).toBeCloseTo(0.6, 2);
    await page.mouse.up();

    // And the pill jumps rather than slides: no transition on its position.
    const pill = await style(page, 'nav .tab-pill', ['transition-property']);
    expect(pill['transition-property']).not.toContain('transform');
  });
});
