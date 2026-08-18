import { describe, it, expect } from 'vitest';
import { fitWithin, base64Bytes, totalBase64Bytes, formatBytes, MAX_EXTRACT_PHOTOS } from './imageUtils';
import { extractPhotoSchema, normaliseExtractPhotoBody } from '../../api/_lib/schemas';

describe('fitWithin', () => {
  it('leaves images smaller than the limit untouched', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('scales the longest edge down to the limit, preserving aspect ratio', () => {
    expect(fitWithin(3200, 2400, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('handles portrait pages, where height is the longest edge', () => {
    expect(fitWithin(2400, 3200, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never rounds a dimension down to zero', () => {
    expect(fitWithin(10000, 3, 1600).height).toBe(1);
  });
});

describe('base64Bytes', () => {
  it.each([
    ['aGk=', 2],
    ['aGkh', 3],
    ['aGVsbG8=', 5],
  ])('decodes the byte length of %s', (b64, expected) => {
    expect(base64Bytes(b64)).toBe(expected);
    expect(base64Bytes(b64)).toBe(atob(b64).length);
  });

  it('sums across a multi-page upload', () => {
    expect(totalBase64Bytes([{ data: 'aGk=' }, { data: 'aGVsbG8=' }])).toBe(7);
  });
});

describe('formatBytes', () => {
  it('uses KB below a megabyte and MB above', () => {
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });
});

describe('extractPhotoSchema', () => {
  const img = (data = 'abc') => ({ data, mimeType: 'image/jpeg' as const });

  it('accepts several pages of one recipe', () => {
    const parsed = extractPhotoSchema.parse({ images: [img(), img(), img()] });
    expect(parsed.images).toHaveLength(3);
  });

  it('rejects an empty list', () => {
    expect(() => extractPhotoSchema.parse({ images: [] })).toThrow();
  });

  it(`rejects more than ${MAX_EXTRACT_PHOTOS} pages`, () => {
    const tooMany = Array.from({ length: MAX_EXTRACT_PHOTOS + 1 }, () => img());
    expect(() => extractPhotoSchema.parse({ images: tooMany })).toThrow();
  });

  it('rejects an unsupported mime type', () => {
    expect(() => extractPhotoSchema.parse({ images: [{ data: 'abc', mimeType: 'image/tiff' }] })).toThrow();
  });

  it('keeps the frontend and backend page limits in sync', () => {
    const overflow = Array.from({ length: MAX_EXTRACT_PHOTOS }, () => img());
    expect(() => extractPhotoSchema.parse({ images: overflow })).not.toThrow();
  });
});

describe('normaliseExtractPhotoBody', () => {
  it('converts the legacy single-image body to the images array', () => {
    const body = normaliseExtractPhotoBody({ imageBase64: 'abc', mimeType: 'image/png' });
    expect(extractPhotoSchema.parse(body).images).toEqual([{ data: 'abc', mimeType: 'image/png' }]);
  });

  it('passes a modern body through unchanged', () => {
    const body = { images: [{ data: 'abc', mimeType: 'image/jpeg' }] };
    expect(normaliseExtractPhotoBody(body)).toBe(body);
  });

  it('prefers images when both shapes are present', () => {
    const body = { images: [{ data: 'new', mimeType: 'image/jpeg' }], imageBase64: 'old', mimeType: 'image/png' };
    expect(extractPhotoSchema.parse(normaliseExtractPhotoBody(body)).images).toEqual([
      { data: 'new', mimeType: 'image/jpeg' },
    ]);
  });
});
