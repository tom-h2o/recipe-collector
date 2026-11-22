/**
 * Whether the images someone picked are camera photos or screenshots, decided
 * from the files as chosen — the upload re-encodes everything as JPEG, so the
 * server cannot tell afterwards.
 *
 * Photos and screenshots run on different models: a photographed page (curved,
 * badly lit, handwritten) is the hardest reading job in the app and has its
 * own task, while a screenshot holds clean digital text like a web page.
 *
 * The file format alone is not enough. Phones used to save screenshots as PNG,
 * but since iOS 26 an HDR screenshot is a HEIF — the same format as a camera
 * photo — and the file input (JPEG/PNG/WebP only) makes iOS hand either one
 * over as a JPEG anyway. So, in order:
 *
 *  1. Camera metadata. A camera photo records how it was taken (exposure time,
 *     aperture, ISO, focal length); a screenshot never does. Decisive.
 *  2. A screen format (PNG, WebP, GIF): a screenshot or an image saved from
 *     the web.
 *  3. A phone screen's shape. With the metadata stripped (some apps and
 *     transfers do), a screenshot still has the screen's proportions, about
 *     9:19.5; camera photos are 4:3, 3:2 or 16:9.
 *  4. Device metadata without camera metadata (maker, model, software, but no
 *     exposure): written by a phone that did not take a photo.
 *  5. Otherwise a photo, the harder case: a screenshot sent to the photo model
 *     is read just as well, only more slowly.
 *
 * One photo among several pages makes the whole set photos.
 */
export type ImageKind = 'photo' | 'screenshot';

const SCREEN_FORMATS = new Set(['image/png', 'image/webp', 'image/gif']);
const CAPTURE_TAGS = ['ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'LensModel', 'ApertureValue', 'ShutterSpeedValue'];
const DEVICE_TAGS = ['Make', 'Model', 'Software'];

export interface ImageFacts {
  /** The file's MIME type as the browser reports it. */
  type: string;
  /** EXIF tags read from the file, or null when it carries none. */
  meta: Record<string, unknown> | null;
  /** Pixel size, or null when it could not be read. */
  size: { width: number; height: number } | null;
}

/** Long side over short side between 18:9 and 21:9: a phone screen, upright or turned. */
export function isPhoneScreenShape({ width, height }: { width: number; height: number }): boolean {
  if (!width || !height) return false;
  const ratio = Math.max(width, height) / Math.min(width, height);
  return ratio >= 1.95 && ratio <= 2.35;
}

export function decideKind({ type, meta, size }: ImageFacts): ImageKind {
  const has = (tags: string[]) => !!meta && tags.some((t) => meta[t] !== undefined && meta[t] !== null);
  if (has(CAPTURE_TAGS)) return 'photo';
  if (SCREEN_FORMATS.has(type)) return 'screenshot';
  if (size && isPhoneScreenShape(size)) return 'screenshot';
  if (has(DEVICE_TAGS)) return 'screenshot';
  return 'photo';
}

/**
 * The file's EXIF tags, or null. Loaded on first use: the reader (exifr's lite
 * build, JPEG and HEIF) is only needed when someone imports photos.
 */
export async function readMeta(file: Blob | Uint8Array): Promise<Record<string, unknown> | null> {
  try {
    const { default: exifr } = await import('exifr/dist/lite.esm.mjs');
    const meta: unknown = await exifr.parse(file);
    return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function readSize(file: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

export async function imageKind(files: File[]): Promise<ImageKind> {
  if (files.length === 0) return 'photo';
  const kinds = await Promise.all(files.map(async (file) => {
    const [meta, size] = await Promise.all([readMeta(file), readSize(file)]);
    return decideKind({ type: file.type, meta, size });
  }));
  return kinds.includes('photo') ? 'photo' : 'screenshot';
}
