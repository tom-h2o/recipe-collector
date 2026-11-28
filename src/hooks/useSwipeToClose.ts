import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

/** How far a sheet has to be pulled before letting go closes it. */
export const SWIPE_CLOSE_DISTANCE = 90;
/** Or how fast it is moving downwards at the moment it is let go, in px per ms. */
export const SWIPE_CLOSE_VELOCITY = 0.55;
/** Which element moves with the finger. */
const SHEET = '[data-sheet]';

/**
 * Pulling a bottom sheet down closes it, as it does everywhere else on a
 * phone. Before this the only ways out were the small ✕ and a tap beside the
 * sheet.
 *
 * The props go on the sheet's grab zone (its handle and title row), not on
 * its content, which has to stay free to scroll. The sheet itself is the
 * nearest ancestor marked `data-sheet`; it follows the finger, and on release
 * either closes (pulled far enough, or flicked) or settles back.
 *
 * Moved with the `translate` property, written straight to the node: it does
 * not disturb a `transform` the sheet's classes may set, and a state update
 * per pointer move would re-render the sheet's content on every frame.
 *
 * `enabled` says whether the thing is a bottom sheet right now; from `sm` the
 * same components are centred dialogs, which nobody pulls.
 */
export function useSwipeToClose(onClose: () => void, enabled: () => boolean = () => true) {
  const drag = useRef<{ pointer: number; sheet: HTMLElement; startY: number; lastY: number; lastT: number; velocity: number } | null>(null);

  function settle(sheet: HTMLElement) {
    sheet.style.transition = 'translate 0.2s ease-out';
    sheet.style.translate = '';
    window.setTimeout(() => { sheet.style.transition = ''; }, 220);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!enabled() || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // The ✕ and anything else to press in the grab zone keep working as they are.
    if ((event.target as Element).closest('button, a, input, select, textarea')) return;
    const sheet = event.currentTarget.closest<HTMLElement>(SHEET);
    if (!sheet) return;
    drag.current = { pointer: event.pointerId, sheet, startY: event.clientY, lastY: event.clientY, lastT: event.timeStamp, velocity: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sheet.style.transition = 'none';
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || event.pointerId !== d.pointer) return;
    const dt = event.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (event.clientY - d.lastY) / dt;
    d.lastY = event.clientY;
    d.lastT = event.timeStamp;
    // Downwards only: a sheet does not lift off the bottom edge.
    d.sheet.style.translate = `0 ${Math.max(0, event.clientY - d.startY)}px`;
  }

  function end(event: ReactPointerEvent<HTMLElement>, cancelled: boolean) {
    const d = drag.current;
    if (!d || event.pointerId !== d.pointer) return;
    drag.current = null;
    const distance = Math.max(0, d.lastY - d.startY);
    const flicked = d.velocity > SWIPE_CLOSE_VELOCITY && distance > 12;
    if (!cancelled && (distance > SWIPE_CLOSE_DISTANCE || flicked)) {
      // Left where the finger let go: it closes from there.
      onClose();
      return;
    }
    settle(d.sheet);
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => end(event, false),
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => end(event, true),
  };
}

/** Below Tailwind's `sm`: where the app's sheets sit on the bottom edge. */
export function isPhoneWidth(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
}
