import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { SAFARI_SHORTCUT_SCRIPT } from '../../shared/safariShortcut';
import { readSharedPage } from '../../api/_lib/shortcutImport';
import { extractStructuredRecipe } from '../../api/_lib/pageExtraction';

/**
 * The script people paste into the Safari Shortcut, run on a page the way
 * "Run JavaScript on Web Page" runs it (a completion() callback), and its
 * result handed to the server's own reader: what the phone sends is what the
 * server understands.
 */

const PAGE = `
  <head>
    <title>Klassische Kürbissuppe | REWE</title>
    <meta property="og:image" content="https://img.rewe-static.de/kuerbissuppe.jpg">
    <style>body { color: red }</style>
    <link rel="stylesheet" href="/big.css">
    <script>window.tracking = 'lots of code';</script>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Klassische Kürbissuppe","recipeIngredient":["1 Hokkaido-Kürbis","1 Zwiebel"],"recipeInstructions":[{"@type":"HowToStep","text":"Kürbis würfeln."},{"@type":"HowToStep","text":"Kochen und pürieren."}],"recipeYield":"4 Portionen"}</script>
  </head>
  <body>
    <nav>Angebote Rezepte Märkte</nav>
    <main style="padding: 4px">
      <h1>Klassische Kürbissuppe</h1>
      <img src="data:image/png;base64,${'A'.repeat(5000)}" alt="placeholder">
      <img src="/kuerbis.jpg" srcset="/a.jpg 1x, /b.jpg 2x" alt="Kürbis">
      <svg><path d="M0 0L10 10"/></svg>
      <ul><li>1 Hokkaido-Kürbis</li><li>1 Zwiebel</li></ul>
    </main>
  </body>`;

// Vitest runs this under jsdom; this tsconfig has no DOM types, so the little
// that is used is described here.
const dom = globalThis as unknown as {
  document: { documentElement: { innerHTML: string }; querySelector(selector: string): unknown };
  location: { href: string };
};

function runScript(): Promise<string> {
  dom.document.documentElement.innerHTML = PAGE;
  return new Promise((resolve) => {
    new Function('completion', SAFARI_SHORTCUT_SCRIPT)(resolve);
  });
}

describe('the Safari Shortcut script', () => {
  it('sends the address and the page, without scripts, styles or inline pictures', async () => {
    const sent = JSON.parse(await runScript()) as { url: string; html: string };
    expect(sent.url).toBe(dom.location.href);
    expect(sent.html).toContain('application/ld+json');
    expect(sent.html).toContain('1 Hokkaido-Kürbis');
    expect(sent.html).not.toContain('window.tracking');
    expect(sent.html).not.toContain('color: red');
    expect(sent.html).not.toContain('big.css');
    expect(sent.html).not.toContain('data:image');
    expect(sent.html).not.toContain('srcset');
    expect(sent.html).not.toContain('padding');
    expect(sent.html).not.toContain('<svg');
    // The page in Safari is left alone: the script works on a copy.
    expect(dom.document.querySelector('style')).not.toBeNull();
  });

  it('is what the server reads: the recipe data comes through', async () => {
    const page = readSharedPage({ page: await runScript() });
    expect(typeof page).toBe('object');
    const { html } = page as { html: string };
    const $ = cheerio.load(html);
    // The page's picture travels in its head, as the server reads it.
    const recipe = extractStructuredRecipe($, '', $('meta[property="og:image"]').attr('content') ?? '');
    expect(recipe).toMatchObject({
      title: 'Klassische Kürbissuppe',
      servings: 4,
      instructions: 'Kürbis würfeln.\nKochen und pürieren.',
      image_url: 'https://img.rewe-static.de/kuerbissuppe.jpg',
    });
    expect(recipe?.ingredients.map((i) => i.name)).toEqual(['Hokkaido-Kürbis', 'Zwiebel']);
  });

  it('stays short enough to copy into a Shortcut by hand, and plain enough for any Safari', () => {
    expect(SAFARI_SHORTCUT_SCRIPT.length).toBeLessThan(600);
    expect(SAFARI_SHORTCUT_SCRIPT).toContain('completion(');
    expect(SAFARI_SHORTCUT_SCRIPT).not.toMatch(/=>|\bconst\b|\blet\b|`/);
  });
});
