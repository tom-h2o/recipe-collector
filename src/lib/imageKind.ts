import { decideKind, type ImageKind } from '../../shared/imageKind';

export { decideKind, isPhoneScreenShape, type ImageFacts, type ImageKind } from '../../shared/imageKind';

/**
 * The browser half of telling photos from screenshots: reads each file as
 * picked (the rules are in shared/imageKind.ts, which the server's Shortcut
 * import uses too).
 */

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
