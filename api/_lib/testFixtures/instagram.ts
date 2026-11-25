/**
 * Instagram's pages as a plain request gets them, cut down to what matters:
 * the meta tags (property first, caption escaped as Instagram writes it) and a
 * body that holds nothing but "Log In / Sign Up", since the rest is drawn by
 * script. Checked against a real public post on 2026-11-24.
 */

export const INSTAGRAM_PICTURE = 'https://scontent-ord5-2.cdninstagram.com/v/t51.82787-15/62572_n.jpg?stp=dst-jpg_e35_s640x640_tt6&_nc_cat=104&_nc_ohc=m_lWi&oh=00_AfB&oe=6B0BE800';

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

export function instagramPostHtml(caption: string, picture = INSTAGRAM_PICTURE): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Instagram</title>
<meta property="og:type" content="article" />
<meta property="og:image" content="${escape(picture)}" />
<meta property="og:title" content="${escape(`Koch Mal on Instagram: "${caption.split('\n')[0]}"`)}" />
<meta property="og:description" content="${escape(`1,234 likes, 56 comments - kochmal on November 20, 2026: "${caption}". `)}" />
<meta property="og:url" content="https://www.instagram.com/kochmal/p/DAbc123xyz/" />
<meta name="description" content="${escape(`1,234 likes, 56 comments - kochmal on November 20, 2026: "${caption}". `)}" />
</head><body><div><span>Log In</span><span>Sign Up</span></div></body></html>`;
}

export const PUMPKIN_CAPTION = `Cremige Kürbissuppe 🎃

Zutaten für 4:
1 Hokkaido
2 Kartoffeln
400 ml Kokosmilch

Kürbis und Kartoffeln würfeln, 20 Minuten kochen, mit der Kokosmilch pürieren.

#kürbissuppe #herbst #rezept`;

/** What a request gets for a post Instagram will not show: its login page. */
export const INSTAGRAM_LOGIN_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Instagram</title>
<meta property="og:title" content="Instagram" />
<meta property="og:url" content="https://instagram.com/" />
<meta name="description" content="Create an account or log in to Instagram - Share what you're into with the people who get you." />
</head><body><span>Log In</span><span>Sign Up</span></body></html>`;
