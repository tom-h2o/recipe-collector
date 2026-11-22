import { describe, expect, it } from 'vitest';
import { decideKind, imageKind, isPhoneScreenShape, readMeta } from './imageKind';

/**
 * Tiny real JPEGs (made with Pillow), so the EXIF reader is exercised on
 * actual bytes, not on a hand-written object:
 *  - CAMERA: Make, Model, ExposureTime, FNumber, ISO, FocalLength — a photo
 *  - DEVICE_ONLY: Make, Model, Software and no capture data — what a phone
 *    writes for an image it did not photograph, e.g. a screenshot
 *  - BARE: no EXIF at all, as after a messenger strips it
 */
const CAMERA = '/9j/4AAQSkZJRgABAQAAAQABAAD/4QCERXhpZgAATU0AKgAAAAgAAwEPAAIAAAAGAAAAMgEQAAIAAAAOAAAAOIdpAAQAAAABAAAARgAAAABBcHBsZQBpUGhvbmUgMTcgUHJvAAAEgpoAAwAAAAIAAQB4gp0AAwAAAAIAsgBkiCcAAwAAAAEAQAAAkgoAAwAAAAICpgBkAAAAAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAAYACAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AO3ooorzzrP/2Q==';
const DEVICE_ONLY = '/9j/4AAQSkZJRgABAQAAAQABAAD/4QCERXhpZgAATU0AKgAAAAgABAEPAAIAAAAGAAAAPgEQAAIAAAAOAAAARAExAAIAAAAFAAAAUodpAAQAAAABAAAAWAAAAABBcHBsZQBpUGhvbmUgMTcgUHJvADI2LjEAAAABkoYAAQAAABIAAABqAAAAAEFTQ0lJAAAAU2NyZWVuc2hvdP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAA0ABgMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APf6KKKAP//Z';
const BARE = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAYDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDwmiiigD//2Q==';
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const portraitPhone = { width: 1206, height: 2622 }; // iPhone screen, 9:19.5
const cameraFrame = { width: 3024, height: 4032 }; // 3:4

describe('reading the metadata', () => {
  it('finds the camera data in a photo', async () => {
    const meta = await readMeta(bytes(CAMERA));
    expect(meta).toMatchObject({ Make: 'Apple', ISO: 64 });
    expect(meta?.ExposureTime).toBeDefined();
  });

  it('finds device data and no camera data in a screenshot-like image', async () => {
    const meta = await readMeta(bytes(DEVICE_ONLY));
    expect(meta).toMatchObject({ Make: 'Apple', Software: '26.1' });
    expect(meta?.ExposureTime).toBeUndefined();
  });

  it('returns null for an image without metadata, or for something that is not an image', async () => {
    expect(await readMeta(bytes(BARE))).toBeNull();
    expect(await readMeta(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('deciding photo or screenshot', () => {
  const camera = { Make: 'Apple', ExposureTime: [1, 120], FNumber: [178, 100] };
  const deviceOnly = { Make: 'Apple', Model: 'iPhone 17 Pro', Software: '26.1' };

  it('takes camera data as decisive, whatever the format or shape', () => {
    expect(decideKind({ type: 'image/jpeg', meta: camera, size: cameraFrame })).toBe('photo');
    expect(decideKind({ type: 'image/png', meta: camera, size: portraitPhone })).toBe('photo');
  });

  it('takes a PNG, WebP or GIF without camera data for a screenshot', () => {
    for (const type of ['image/png', 'image/webp', 'image/gif']) {
      expect(decideKind({ type, meta: null, size: null })).toBe('screenshot');
    }
  });

  it('recognises an iOS 26 HDR screenshot: a HEIF, or the JPEG iOS hands over, with no camera data', () => {
    expect(decideKind({ type: 'image/heic', meta: deviceOnly, size: portraitPhone })).toBe('screenshot');
    expect(decideKind({ type: 'image/jpeg', meta: deviceOnly, size: null })).toBe('screenshot');
  });

  it('recognises a screenshot with its metadata stripped by the shape of a phone screen', () => {
    expect(decideKind({ type: 'image/jpeg', meta: null, size: portraitPhone })).toBe('screenshot');
    expect(decideKind({ type: 'image/jpeg', meta: null, size: { width: 2622, height: 1206 } })).toBe('screenshot');
  });

  it('takes a stripped image of camera proportions, or one it knows nothing about, for a photo', () => {
    expect(decideKind({ type: 'image/jpeg', meta: null, size: cameraFrame })).toBe('photo');
    expect(decideKind({ type: 'image/jpeg', meta: null, size: { width: 1920, height: 1080 } })).toBe('photo');
    expect(decideKind({ type: 'image/jpeg', meta: null, size: null })).toBe('photo');
    expect(decideKind({ type: '', meta: null, size: null })).toBe('photo');
  });

  it('knows a phone screen from camera frames', () => {
    expect(isPhoneScreenShape({ width: 1179, height: 2556 })).toBe(true); // 19.5:9
    expect(isPhoneScreenShape({ width: 1080, height: 2400 })).toBe(true); // 20:9
    expect(isPhoneScreenShape({ width: 3000, height: 4000 })).toBe(false); // 4:3
    expect(isPhoneScreenShape({ width: 1080, height: 1920 })).toBe(false); // 16:9
    expect(isPhoneScreenShape({ width: 0, height: 0 })).toBe(false);
  });
});

describe('imageKind', () => {
  const file = (b64: string, type = 'image/jpeg') => new File([bytes(b64)], 'page.jpg', { type });

  it('reads files as picked: a camera JPEG is a photo, a device-only JPEG a screenshot', async () => {
    expect(await imageKind([file(CAMERA)])).toBe('photo');
    expect(await imageKind([file(DEVICE_ONLY)])).toBe('screenshot');
  });

  it('makes a set with one photo in it photos, so the hard page gets the strong model', async () => {
    expect(await imageKind([file(DEVICE_ONLY), file(CAMERA)])).toBe('photo');
  });

  it('calls nothing a screenshot', async () => {
    expect(await imageKind([])).toBe('photo');
  });
});
