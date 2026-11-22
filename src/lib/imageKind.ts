/**
 * Whether the images someone picked are camera photos or screenshots, decided
 * from the files as chosen — the upload re-encodes everything as JPEG, so the
 * server cannot tell afterwards.
 *
 * Photos and screenshots run on different models: a photographed page (curved,
 * badly lit, handwritten) is the hardest reading job in the app and has its
 * own task, while a screenshot holds clean digital text like a web page.
 *
 * The signal is the file format. Phones save screenshots as PNG (every iPhone,
 * most Android phones) and camera photos as JPEG or HEIC; WebP and GIF are
 * images saved from the web. Anything else, or a file with no type at all
 * (some browsers report HEIC that way), counts as a photo: a screenshot sent to
 * the photo model is read just as well, only a little more slowly. One photo
 * among several pages makes the whole set photos.
 */
export type ImageKind = 'photo' | 'screenshot';

const SCREEN_FORMATS = new Set(['image/png', 'image/webp', 'image/gif']);

export function imageKind(files: Pick<File, 'type'>[]): ImageKind {
  return files.length > 0 && files.every((f) => SCREEN_FORMATS.has(f.type)) ? 'screenshot' : 'photo';
}
