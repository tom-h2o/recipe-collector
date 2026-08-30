import * as React from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keeps Tab and Shift+Tab inside a dialog.
 *
 * Base UI renders focus guards, but in this setup it never marks the rest of
 * the document inert or aria-hidden, so tabbing past the last control walked
 * out of the modal and into the page behind it. This wraps at the boundaries,
 * which is the part that was missing; initial focus and focus return are still
 * handled by the library.
 */
export function useFocusTrap() {
  return React.useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;

    const container = event.currentTarget;
    const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }
  }, []);
}

/**
 * Restores focus to whatever was focused before the dialog opened.
 *
 * These dialogs are opened programmatically from buttons elsewhere in the app
 * (the toolbar, a recipe card) while rendering a hidden `DialogTrigger`. Base UI
 * returns focus to that trigger, which is `display: none` and cannot take it, so
 * focus fell back to the document body and keyboard users lost their place.
 */
export function useReturnFocus() {
  const previous = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    previous.current = document.activeElement as HTMLElement | null;
    return () => {
      const el = previous.current;
      if (!el || !el.isConnected || typeof el.focus !== 'function') return;
      // after the library has finished its own focus handling
      requestAnimationFrame(() => {
        if (el.isConnected) el.focus();
      });
    };
  }, []);
}
