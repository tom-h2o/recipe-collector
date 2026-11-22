/**
 * Reading images that arrive as raw bytes, for the iPhone Shortcut import
 * (shortcutImport.ts). The browser's own upload never needs this: it knows
 * each file's type and re-encodes everything as JPEG before sending.
 */

export type SupportedImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** The four formats Claude and Gemini both read; HEIC is not one of them. */
export const SUPPORTED_IMAGE_TYPES: readonly SupportedImageType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.subarray(from, from + length));

/** The format from the file's first bytes, whatever the sender claimed. */
export function sniffImageType(bytes: Uint8Array): SupportedImageType | 'image/heic' | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'image/png';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image/gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 4, 4) === 'ftyp' && ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(ascii(bytes, 8, 4))) return 'image/heic';
  return null;
}

/**
 * Pixel size as stored in the file, or null when it cannot be read. Stored,
 * not displayed: a JPEG rotated by its EXIF orientation reports width and
 * height swapped, which the phone-screen-shape rule does not mind because it
 * compares the long side with the short one.
 */
export function imageSize(bytes: Uint8Array, type: SupportedImageType): { width: number; height: number } | null {
  const u16be = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const u16le = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  const u24le = (i: number) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
  const u32be = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  try {
    switch (type) {
      case 'image/png':
        return { width: u32be(16), height: u32be(20) };
      case 'image/gif':
        return { width: u16le(6), height: u16le(8) };
      case 'image/webp': {
        const chunk = ascii(bytes, 12, 4);
        if (chunk === 'VP8X') return { width: 1 + u24le(24), height: 1 + u24le(27) };
        if (chunk === 'VP8 ') return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
        if (chunk === 'VP8L') {
          const b = (i: number) => bytes[21 + i];
          return { width: 1 + (((b(1) & 0x3f) << 8) | b(0)), height: 1 + (((b(3) & 0x0f) << 10) | (b(2) << 2) | ((b(1) & 0xc0) >> 6)) };
        }
        return null;
      }
      case 'image/jpeg': {
        // Walk the segments to the first start-of-frame marker, which holds the size.
        let i = 2;
        while (i + 9 < bytes.length) {
          if (bytes[i] !== 0xff) { i += 1; continue; }
          const marker = bytes[i + 1];
          if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) { i += marker === 0xff ? 1 : 2; continue; }
          const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
          if (isFrame) return { height: u16be(i + 5), width: u16be(i + 7) };
          i += 2 + u16be(i + 2);
        }
        return null;
      }
    }
  } catch {
    return null;
  }
}

// How the base64 of each supported format begins. Used to find where one
// image ends and the next starts when a Shortcut sends them all as one block
// of text. HEIC (base64 "AAAA…") is left out on purpose: runs of zero bytes
// inside a JPEG wrap to lines starting "AAAA" too, and HEIC is refused anyway.
const IMAGE_STARTS = ['/9j/', 'iVBORw0KGgo', 'R0lGOD', 'UklGR'];

function stripDataUrl(value: string): string {
  const comma = value.startsWith('data:') ? value.indexOf(',') : -1;
  return (comma >= 0 ? value.slice(comma + 1) : value).replace(/\s+/g, '');
}

/**
 * The base64 images in a Shortcut's request, however Shortcuts serialised them:
 *  - a JSON array of strings (or of `{ data }` objects), the intended shape;
 *  - one string with the images on separate lines, which is what a list of
 *    text becomes when Shortcuts puts it into a text field — possibly with
 *    each image itself wrapped every 76 characters, if "Base64 Encode" was
 *    left on its line-break setting. A new image is recognised by how its
 *    base64 begins, so wrapped lines are joined back to the image they belong to.
 * Data-URL prefixes and whitespace are dropped.
 */
export function splitBase64Images(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === 'string' ? item : (item && typeof item === 'object' && typeof (item as { data?: unknown }).data === 'string' ? (item as { data: string }).data : '')))
      .map(stripDataUrl)
      .filter(Boolean);
  }
  if (typeof input !== 'string') return [];
  const images: string[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const startsImage = line.startsWith('data:') || IMAGE_STARTS.some((s) => line.startsWith(s));
    if (startsImage || images.length === 0) images.push(stripDataUrl(line));
    else images[images.length - 1] += line.replace(/\s+/g, '');
  }
  return images.filter(Boolean);
}

export function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}
