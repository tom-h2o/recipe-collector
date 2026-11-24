/**
 * A shared Shortcut's iCloud link, found in whatever was pasted.
 *
 * What the Shortcuts app hands over is not always the bare link: depending on
 * how it was copied it can carry the Shortcut's name in front, a line break,
 * or a trailing query. The admin's field used to accept only the bare link,
 * as a browser "url" field, so a paste with anything around it was refused
 * by the server or, on an iPhone, silently by the browser, and the link was
 * never stored. Both the app and the server now look for the link inside the
 * text and keep only its canonical form, so what every user's
 * "Add to Shortcuts" button opens is always https://www.icloud.com/shortcuts/<id>.
 */
const FIND_LINK = /https:\/\/(?:www\.)?icloud\.com\/shortcuts\/([A-Za-z0-9]{8,64})/i;

export function findShortcutLink(text: string): string | null {
  const match = FIND_LINK.exec(text);
  return match ? `https://www.icloud.com/shortcuts/${match[1]}` : null;
}
