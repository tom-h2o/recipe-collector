/** A single recipe can span several photos (e.g. a two-page cookbook spread). */
export const MAX_EXTRACT_PHOTOS = 8;

/**
 * Vercel rejects serverless request bodies over 4.5 MB. Base64 inflates bytes by
 * ~4/3, so we keep the encoded payload comfortably below that.
 */
export const MAX_EXTRACT_PAYLOAD_BYTES = 3.5 * 1024 * 1024;

/**
 * Encoding steps, tried in order until the whole batch fits the payload budget.
 * The first is comfortably legible for OCR; later ones trade quality for size so
 * that a large batch still goes through instead of failing.
 */
export const ENCODE_STEPS = [
  { maxEdge: 1600, quality: 0.82 },
  { maxEdge: 1400, quality: 0.72 },
  { maxEdge: 1100, quality: 0.62 },
] as const;

/** Scales (width, height) down so the longest edge is at most maxEdge. Never upscales. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Decoded byte length of a base64 string, without decoding it. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function totalBase64Bytes(images: { data: string }[]): number {
  return images.reduce((sum, img) => sum + base64Bytes(img.data), 0);
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Longest edge for images kept in the gallery.
 *
 * Extraction downscales to 1600px purely to fit the request budget; that copy is
 * throwaway. What the user keeps should stay close to the original, so it is
 * re-encoded larger and at higher quality. A 2560px photo lands around 1-2 MB,
 * inside the bucket's 5 MB cap, and re-encoding also brings outsized phone
 * originals under the limit rather than having the upload rejected.
 */
const GALLERY_MAX_EDGE = 2560;
const GALLERY_QUALITY = 0.9;

/** Re-encodes a photo for storage, preserving as much detail as the cap allows. */
export async function encodeForGallery(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, GALLERY_MAX_EDGE);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', GALLERY_QUALITY),
  );
  if (!blob) throw new Error('Could not encode the image.');
  return blob;
}

export interface ExtractImage {
  data: string;
  mimeType: 'image/jpeg';
}

/**
 * Downscales a photo and returns it as base64 JPEG. Recipe photos are re-encoded
 * rather than sent as-is so that a multi-page upload stays within the request limit.
 */
export async function downscaleToBase64(
  file: File,
  { maxEdge, quality }: { maxEdge: number; quality: number } = ENCODE_STEPS[0],
): Promise<ExtractImage> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { data: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
}

/**
 * Encodes every page, stepping down quality until the batch fits the payload
 * budget. Throws only if even the smallest encoding is too large.
 */
export async function encodePhotosForExtraction(files: File[]): Promise<ExtractImage[]> {
  let images: ExtractImage[] = [];
  for (const step of ENCODE_STEPS) {
    images = await Promise.all(files.map((f) => downscaleToBase64(f, step)));
    if (totalBase64Bytes(images) <= MAX_EXTRACT_PAYLOAD_BYTES) return images;
  }
  throw new Error(
    `These ${files.length} photos are too large to send together (${formatBytes(totalBase64Bytes(images))}). Remove a page or two and try again.`,
  );
}
