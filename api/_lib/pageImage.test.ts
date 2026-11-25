import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CAMERA_JPEG } from './testFixtures/images';
import { INSTAGRAM_PICTURE } from './testFixtures/instagram';

/**
 * Instagram signs every picture address with an expiry a few days out, so a
 * recipe imported from a post kept a link that died within the week. Such a
 * picture is copied into our storage; any other address is left alone.
 */

const fetchPublicUrl = vi.hoisted(() => vi.fn());
vi.mock('./publicUrl.js', () => ({ fetchPublicUrl }));

import { hasExpiringAddress, keepPicture, pictureFor } from './pageImage';

const JPEG = Uint8Array.from(Buffer.from(CAMERA_JPEG, 'base64'));

function storage(error: { message: string } | null = null) {
  const uploads: { path: string; type: string }[] = [];
  const supabase = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: Uint8Array, opts: { contentType: string }) => {
          expect(bucket).toBe('recipe-images');
          if (!error) uploads.push({ path, type: opts.contentType });
          return { error };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;
  return { supabase, uploads };
}

const picture = (bytes: Uint8Array, status = 200) => ({
  ok: status === 200,
  status,
  headers: new Headers({ 'content-length': String(bytes.length) }),
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

afterEach(() => fetchPublicUrl.mockReset());

describe('which pictures expire', () => {
  it('is Instagram and Facebook, on any of their CDN hosts', () => {
    expect(hasExpiringAddress(INSTAGRAM_PICTURE)).toBe(true);
    expect(hasExpiringAddress('https://scontent.xx.fbcdn.net/v/t1.jpg?oe=1')).toBe(true);
    expect(hasExpiringAddress('https://www.chefkoch.de/bilder/suppe.jpg')).toBe(false);
    expect(hasExpiringAddress('https://evil.example/cdninstagram.com.jpg')).toBe(false);
    expect(hasExpiringAddress('')).toBe(false);
  });

  it("takes a signed address from the page, not from the model's copy of it", () => {
    const garbled = INSTAGRAM_PICTURE.replace('oe=6B0BE800', 'oe=6B0BE8');
    expect(pictureFor(garbled, INSTAGRAM_PICTURE)).toBe(INSTAGRAM_PICTURE);
    expect(pictureFor('', INSTAGRAM_PICTURE)).toBe(INSTAGRAM_PICTURE);
    // Anything else: the model's choice stands, as before.
    expect(pictureFor('https://example.com/a.jpg', 'https://example.com/og.jpg')).toBe('https://example.com/a.jpg');
    expect(pictureFor('https://example.com/a.jpg', INSTAGRAM_PICTURE)).toBe('https://example.com/a.jpg');
  });
});

describe('keepPicture', () => {
  it('copies an Instagram picture into our storage', async () => {
    fetchPublicUrl.mockResolvedValue(picture(JPEG));
    const { supabase, uploads } = storage();
    const kept = await keepPicture(supabase, INSTAGRAM_PICTURE);
    expect(fetchPublicUrl).toHaveBeenCalledWith(INSTAGRAM_PICTURE, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(uploads).toEqual([{ path: expect.stringMatching(/^[0-9a-f-]{36}\.jpg$/), type: 'image/jpeg' }]);
    expect(kept).toBe(`https://storage.test/${uploads[0].path}`);
  });

  it('leaves every other address alone, without fetching it', async () => {
    const { supabase, uploads } = storage();
    expect(await keepPicture(supabase, 'https://www.chefkoch.de/bilder/suppe.jpg')).toBe('https://www.chefkoch.de/bilder/suppe.jpg');
    expect(await keepPicture(supabase, '')).toBe('');
    expect(fetchPublicUrl).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it('keeps the address when no copy can be made, so the recipe is still saved', async () => {
    const { supabase } = storage();
    fetchPublicUrl.mockResolvedValueOnce(picture(JPEG, 403));
    expect(await keepPicture(supabase, INSTAGRAM_PICTURE)).toBe(INSTAGRAM_PICTURE);
    fetchPublicUrl.mockResolvedValueOnce(picture(new TextEncoder().encode('<html>not a picture</html>')));
    expect(await keepPicture(supabase, INSTAGRAM_PICTURE)).toBe(INSTAGRAM_PICTURE);
    fetchPublicUrl.mockRejectedValueOnce(new Error('network down'));
    expect(await keepPicture(supabase, INSTAGRAM_PICTURE)).toBe(INSTAGRAM_PICTURE);

    fetchPublicUrl.mockResolvedValueOnce(picture(JPEG));
    expect(await keepPicture(storage({ message: 'bucket full' }).supabase, INSTAGRAM_PICTURE)).toBe(INSTAGRAM_PICTURE);
  });
});
