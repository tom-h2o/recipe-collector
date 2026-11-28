import { describe, expect, it } from 'vitest';
import { keyboardInset, KEYBOARD_MIN_HEIGHT } from './useKeyboardInset';

/**
 * How much of the page the on-screen keyboard covers. A bottom sheet is lifted
 * by this much, so it sits on the keyboard instead of under it.
 */
describe('keyboardInset', () => {
  it('is 0 with no keyboard: the visible part is the whole page', () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
  });

  it('is the keyboard\'s height when it covers the bottom of the page', () => {
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336);
  });

  it('allows for a page Safari has already pushed up', () => {
    // The visible part starts 120 px down the page, so only 216 px of the
    // page's bottom are still covered.
    expect(keyboardInset(844, { height: 508, offsetTop: 120 })).toBe(216);
  });

  it('ignores a browser toolbar showing or hiding', () => {
    expect(keyboardInset(844, { height: 844 - (KEYBOARD_MIN_HEIGHT - 1), offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, { height: 844 - KEYBOARD_MIN_HEIGHT, offsetTop: 0 })).toBe(KEYBOARD_MIN_HEIGHT);
  });

  it('is never negative, and 0 where the browser has no visual viewport', () => {
    expect(keyboardInset(844, { height: 900, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, null)).toBe(0);
    expect(keyboardInset(844, undefined)).toBe(0);
  });
});
