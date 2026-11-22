import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The button the menu hangs off. */
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** Distance from the viewport edge the menu refuses to cross. */
  margin?: number;
  className?: string;
  /** Which edge of the button the menu lines up with: the right (a ⋯ button) or the left (a filter chip). */
  align?: 'start' | 'end';
}

/**
 * A dropdown that cannot be clipped by whatever it happens to sit inside.
 *
 * The recipe drawer scrolls, which makes it `overflow-y: auto`; CSS then
 * computes `overflow-x` as `auto` too, so the drawer became a clipping box for
 * anything absolutely positioned inside it. The old menu was `absolute right-0`
 * on a button that `flex-wrap` pushes to the start of a second row on a narrow
 * phone — which put more than half of it off the left edge, legible as "olic
 * link" and "te tags". Measured at 320px: 53% of the menu clipped away.
 *
 * Two things fix that, and both are needed: rendering through a portal so no
 * ancestor can clip it, and clamping its position to the viewport so it cannot
 * leave the screen on its own.
 */
export function AnchoredMenu({ open, onClose, anchorRef, children, margin = 8, className = '', align = 'end' }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;

    // Written straight to the node rather than held in state: this runs on
    // every scroll frame, and a re-render per frame would be wasteful as well
    // as a setState-in-effect.
    const place = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;

      const a = anchor.getBoundingClientRect();
      const { width, height } = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Right-aligned to the button by preference, then pulled back inside the
      // viewport. max() last so a menu wider than the screen starts at the
      // left edge rather than off it.
      const preferred = align === 'start' ? a.left : a.right - width;
      const left = Math.max(margin, Math.min(preferred, vw - width - margin));

      // Below the button, unless there is more room above it.
      const below = a.bottom + 4;
      const fitsBelow = below + height <= vh - margin;
      const top = fitsBelow ? below : Math.max(margin, a.top - height - 4);

      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
      menu.style.visibility = 'visible';
    };

    place();

    // `true` captures scrolling inside the drawer, not just the window: the
    // menu is fixed now, so it would otherwise stay put while its button moves.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);

    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open, onClose, anchorRef, margin, align]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        // Hidden for the first frame only, while it is measured in place.
        visibility: 'hidden',
        maxHeight: `calc(100vh - ${margin * 2}px)`,
      }}
      className={`z-50 overflow-y-auto overscroll-contain ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
