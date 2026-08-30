import { describe, it, expect } from 'vitest';
import { fitWithin } from './imageUtils';

/**
 * The gallery keeps a 2560px copy while extraction sends 1600px ones. These
 * guard the sizing contract that keeps uploads inside the bucket's 5 MB cap.
 */
describe('gallery image sizing', () => {
  it('caps the longest edge at 2560 for oversized phone photos', () => {
    expect(fitWithin(4032, 3024, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(3024, 4032, 2560)).toEqual({ width: 1920, height: 2560 });
  });

  it('leaves smaller photos untouched rather than upscaling them', () => {
    expect(fitWithin(1200, 800, 2560)).toEqual({ width: 1200, height: 800 });
  });

  it('keeps the gallery copy larger than the extraction copy', () => {
    // If these ever crossed, the archived image would be worse than the one we
    // throw away after sending it to Gemini.
    const gallery = fitWithin(4032, 3024, 2560).width;
    const extraction = fitWithin(4032, 3024, 1600).width;
    expect(gallery).toBeGreaterThan(extraction);
  });
});
