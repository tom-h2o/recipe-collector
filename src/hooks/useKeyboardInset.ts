import { useEffect, useState } from 'react';

/** A change smaller than this is a browser toolbar showing or hiding, not a keyboard. */
export const KEYBOARD_MIN_HEIGHT = 80;

interface ViewportLike { height: number; offsetTop: number }

/**
 * How much of the page's bottom the on-screen keyboard covers, in px.
 *
 * `layoutHeight` is the height the page is laid out in, which a keyboard does
 * not change on iOS; `viewport` is the part of it that can be seen.
 */
export function keyboardInset(layoutHeight: number, viewport: ViewportLike | null | undefined): number {
  if (!viewport) return 0;
  const covered = Math.round(layoutHeight - viewport.offsetTop - viewport.height);
  return covered >= KEYBOARD_MIN_HEIGHT ? covered : 0;
}

/**
 * The height of the on-screen keyboard while it is open, 0 otherwise.
 *
 * On an iPhone the keyboard does not resize the page: it slides over the
 * bottom of it. A sheet pinned to the bottom edge is then under the keyboard,
 * and when one of its fields is focused Safari pushes the whole page up by
 * however much it takes to show that field. The sheet ends up somewhere in
 * the middle of the screen, cut off from the edge it was attached to, which
 * is what "What can I cook?" did as soon as its field was tapped. With this
 * number the sheet can sit on top of the keyboard instead, so nothing has to
 * be pushed.
 *
 * Read from the Visual Viewport API; 0 where there is none, and while
 * `enabled` is false.
 */
export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? null : window.visualViewport;
    if (!enabled || !viewport) return;
    const measure = () => setInset(keyboardInset(document.documentElement.clientHeight, viewport));
    measure();
    viewport.addEventListener('resize', measure);
    viewport.addEventListener('scroll', measure);
    return () => {
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
      setInset(0);
    };
  }, [enabled]);

  return enabled ? inset : 0;
}
