import { describe, expect, it } from 'vitest';
import { imageKind } from './imageKind';

const file = (type: string) => ({ type });

describe('imageKind', () => {
  it('takes a PNG for a screenshot, as every iPhone and most Android phones save them', () => {
    expect(imageKind([file('image/png')])).toBe('screenshot');
  });

  it('takes images saved from the web for screenshots too', () => {
    expect(imageKind([file('image/webp'), file('image/gif')])).toBe('screenshot');
  });

  it('takes camera formats for photos', () => {
    expect(imageKind([file('image/jpeg')])).toBe('photo');
    expect(imageKind([file('image/heic')])).toBe('photo');
  });

  it('takes a file with no type for a photo, as some browsers report HEIC', () => {
    expect(imageKind([file('')])).toBe('photo');
  });

  it('makes a set with one photo in it photos, so the hard page gets the strong model', () => {
    expect(imageKind([file('image/png'), file('image/jpeg')])).toBe('photo');
  });

  it('calls nothing a screenshot', () => {
    expect(imageKind([])).toBe('photo');
  });
});
