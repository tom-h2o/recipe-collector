import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const viteConfig = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8');

/** `--sk-primary: 49 95 59` → `#315f3b`. */
function brandGreen(): string {
  const m = css.match(/--sk-primary:\s*(\d+)\s+(\d+)\s+(\d+)/);
  if (!m) throw new Error('--sk-primary is no longer declared as three numbers');
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

describe('the installed app', () => {
  it('declares exactly one manifest, and does not hand-write it', () => {
    // vite-plugin-pwa injects /manifest.webmanifest at build time. A
    // hand-written public/manifest.json used to sit next to it, and because a
    // browser takes the FIRST manifest link, that one won: the installed app
    // kept calling itself "Recipe Vault" in orange long after the rename, and
    // editing the plugin's config changed nothing a phone could see.
    expect(indexHtml).not.toMatch(/<link[^>]+rel="manifest"/);
    expect(existsSync(join(ROOT, 'public', 'manifest.json'))).toBe(false);
  });

  it('is called Speisekammer where a phone can read it', () => {
    expect(viteConfig).toMatch(/name: 'Speisekammer'/);
    expect(viteConfig).toMatch(/short_name: 'Speisekammer'/);
    expect(viteConfig).not.toMatch(/Recipe Vault'/);
  });

  it('uses the brand green for the theme, in both places that declare it', () => {
    const green = brandGreen();
    expect(green).toBe('#315f3b');
    expect(indexHtml).toContain(`<meta name="theme-color" content="${green}" />`);
    expect(viteConfig).toContain(`theme_color: '${green}'`);
  });

  it('ships the icons the manifest promises', () => {
    for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      expect(viteConfig).toContain(`/${icon}`);
      expect(existsSync(join(ROOT, 'public', icon))).toBe(true);
    }
  });

  it('gives iOS an apple-touch-icon, which is the only icon it reads', () => {
    // iOS ignores the manifest's icons for "Add to Home Screen" and takes this
    // link instead; without it the home screen falls back to a screenshot.
    expect(indexHtml).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" \/>/);
    expect(existsSync(join(ROOT, 'public', 'apple-touch-icon.png'))).toBe(true);
  });

  it('keeps maskable art separate from the normal icon', () => {
    // Android crops up to 20% off every edge of a maskable icon. Marking the
    // full-size artwork 'any maskable' gets the key clipped on most launchers.
    expect(viteConfig).toMatch(/purpose: 'maskable'/);
    expect(viteConfig).not.toMatch(/purpose: 'any maskable'/);
  });

  it('has no second service worker lying around', () => {
    // A hand-written public/sw.js predating vite-plugin-pwa shipped to dist
    // alongside the generated one. The generated one currently wins, which
    // makes this exactly the kind of trap that only bites after an unrelated
    // change to build order.
    expect(existsSync(join(ROOT, 'public', 'sw.js'))).toBe(false);
  });
});
