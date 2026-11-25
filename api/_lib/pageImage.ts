import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPublicUrl } from './publicUrl.js';
import { sniffImageType } from './imageBytes.js';
import { PAGE_REQUEST_HEADERS } from './sharedPage.js';

/**
 * A recipe read from a page keeps the page's picture by its address. That is
 * fine for a recipe site, and broke for Instagram: its CDN (and Facebook's)
 * signs every picture address with an expiry a few days out (`oe=`) and
 * answers 403 after it, so a recipe imported from a post lost its photo
 * within the week. Pictures from those hosts are copied into our own storage
 * when the recipe is read; every other address is left as it is.
 *
 * Copied on reading, not on saving: the app saves a pasted link's recipe
 * straight to the table, past any server. A read that is never saved leaves
 * one small picture in the bucket.
 */
const EXPIRING_PICTURE_HOSTS = ['cdninstagram.com', 'fbcdn.net'];
const MAX_PICTURE_BYTES = 8_000_000;
const PICTURE_TIMEOUT_MS = 10_000;
const BUCKET = 'recipe-images';

export function hasExpiringAddress(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return EXPIRING_PICTURE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/**
 * The picture to keep. A signed address is several hundred characters of
 * parameters, which a model copying it can get subtly wrong; when the page's
 * own og:image is such an address, it is taken from the page rather than from
 * the model's answer.
 */
export function pictureFor(modelUrl: string, ogImage: string): string {
  if (ogImage && hasExpiringAddress(ogImage) && (!modelUrl || hasExpiringAddress(modelUrl))) return ogImage;
  return modelUrl;
}

/**
 * Our own copy of a picture whose address expires, or the address unchanged:
 * for any other host, and whenever the copy cannot be made (the picture was
 * there minutes ago, so a failure is most likely passing; the recipe is
 * still saved).
 */
export async function keepPicture(supabase: SupabaseClient, url: string): Promise<string> {
  if (!hasExpiringAddress(url)) return url;
  try {
    const response = await fetchPublicUrl(url, { headers: PAGE_REQUEST_HEADERS, signal: AbortSignal.timeout(PICTURE_TIMEOUT_MS) });
    if (!response.ok) return url;
    if (Number(response.headers.get('content-length') ?? 0) > MAX_PICTURE_BYTES) return url;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_PICTURE_BYTES) return url;
    const type = sniffImageType(bytes);
    if (!type || type === 'image/heic') return url;

    const path = `${randomUUID()}.${type.split('/')[1].replace('jpeg', 'jpg')}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false });
    if (error) {
      console.warn('keepPicture: not stored', error.message);
      return url;
    }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.warn('keepPicture: not copied', err instanceof Error ? err.message : err);
    return url;
  }
}
