/**
 * The script the Safari Shortcut ("Save page to Speisekammer") runs with
 * "Run JavaScript on Web Page", on the page the person has open.
 *
 * It returns the page's address and its HTML as JSON text, which the Shortcut
 * sends as `page` to POST /api/extract?via=shortcut. The HTML is the page as
 * Safari shows it, so sites that refuse their pages to servers (rewe.de, see
 * describePageRefusal in api/extract.ts) still work. Scripts, styles and
 * pictures are dropped to keep the request small; the schema.org Recipe data
 * (`application/ld+json`) and the visible text, which is all the server reads,
 * stay. Shortcuts requires the result to be handed to completion().
 *
 * Shown in Settings with a Copy button, and copied by hand into the Shortcut,
 * so it is plain ES5 and kept short. tests/unit/safariShortcut.test.ts runs it
 * and feeds the result to the server's own reader.
 */
export const SAFARI_SHORTCUT_SCRIPT = `var page = document.documentElement.cloneNode(true);
page.querySelectorAll('script:not([type="application/ld+json"]), style, link, svg, noscript, iframe, template, video, audio, canvas, img[src^="data:"]').forEach(function (e) { e.remove(); });
page.querySelectorAll('[style], [srcset]').forEach(function (e) { e.removeAttribute('style'); e.removeAttribute('srcset'); });
completion(JSON.stringify({ url: location.href, html: page.outerHTML.slice(0, 2000000) }));`;

/** The name the Shortcut is given, which is what appears in Safari's share sheet. */
export const SAFARI_SHORTCUT_NAME = 'Save page to Speisekammer';
