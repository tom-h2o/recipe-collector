import { describe, expect, it } from 'vitest';
import { decodeBase64, imageSize, sniffImageType, splitBase64Images } from './imageBytes';
import { CAMERA_JPEG, DEVICE_JPEG, HEIC_START, SCREEN_PNG } from './testFixtures/images';

describe('sniffImageType', () => {
  it('goes by the bytes, not by what the sender said', () => {
    expect(sniffImageType(decodeBase64(CAMERA_JPEG))).toBe('image/jpeg');
    expect(sniffImageType(decodeBase64(SCREEN_PNG))).toBe('image/png');
    expect(sniffImageType(decodeBase64(HEIC_START))).toBe('image/heic');
    expect(sniffImageType(new TextEncoder().encode('just some text, not a picture'))).toBeNull();
  });
});

describe('imageSize', () => {
  it('reads the pixel size of a JPEG and a PNG', () => {
    expect(imageSize(decodeBase64(CAMERA_JPEG), 'image/jpeg')).toEqual({ width: 8, height: 6 });
    expect(imageSize(decodeBase64(DEVICE_JPEG), 'image/jpeg')).toEqual({ width: 6, height: 13 });
    expect(imageSize(decodeBase64(SCREEN_PNG), 'image/png')).toEqual({ width: 6, height: 13 });
  });

  it('gives up rather than guessing on a truncated file', () => {
    expect(imageSize(decodeBase64(CAMERA_JPEG).subarray(0, 40), 'image/jpeg')).toBeNull();
  });
});

describe('splitBase64Images: however Shortcuts sends the list', () => {
  const wrap = (b64: string) => b64.match(/.{1,76}/g)!.join('\n');

  it('takes a JSON array of strings, or of { data } objects', () => {
    expect(splitBase64Images([CAMERA_JPEG, SCREEN_PNG])).toEqual([CAMERA_JPEG, SCREEN_PNG]);
    expect(splitBase64Images([{ data: CAMERA_JPEG }])).toEqual([CAMERA_JPEG]);
  });

  it('takes one string with an image per line', () => {
    expect(splitBase64Images(`${CAMERA_JPEG}\n${SCREEN_PNG}`)).toEqual([CAMERA_JPEG, SCREEN_PNG]);
  });

  it('joins images wrapped every 76 characters back together', () => {
    expect(splitBase64Images(`${wrap(CAMERA_JPEG)}\n${wrap(DEVICE_JPEG)}\n${wrap(SCREEN_PNG)}`)).toEqual([CAMERA_JPEG, DEVICE_JPEG, SCREEN_PNG]);
    expect(splitBase64Images([wrap(CAMERA_JPEG)])).toEqual([CAMERA_JPEG]);
  });

  it('drops a data-URL prefix', () => {
    expect(splitBase64Images([`data:image/jpeg;base64,${CAMERA_JPEG}`])).toEqual([CAMERA_JPEG]);
  });

  it('finds nothing in nothing', () => {
    expect(splitBase64Images(undefined)).toEqual([]);
    expect(splitBase64Images('')).toEqual([]);
    expect(splitBase64Images(42)).toEqual([]);
  });
});
