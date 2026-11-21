/**
 * Touch feedback for everything that can be tapped.
 *
 * While a control is held it carries `data-pressed`; for a moment after it is
 * let go it carries `data-released`. index.css does the rest: pressed things
 * fade at once, buttons also give a little, and on release they recover
 * softly.
 *
 * Why attributes set from here rather than `:active` in CSS:
 *
 *  - The recovery has to be an animation. A transition would be the natural
 *    tool, but nearly every control here carries a Tailwind transition utility
 *    (`transition-colors`, `transition-all`), and whichever one it is replaces
 *    `transition-property` wholesale. A press written as a transition would be
 *    soft on some controls and instant on others, depending on a class nobody
 *    chose for that reason. A keyframe animation is untouched by them, and CSS
 *    has no way to start one "on release" by itself.
 *  - iOS Safari only applies `:active` on a tap when a touch listener happens
 *    to be registered, which is the kind of thing that works until it does not.
 *
 * Pointer events cover mouse, touch and pen with one code path. A finger that
 * starts a scroll fires `pointercancel`, which releases the control again.
 */

/** What counts as tappable. Kept in step with the selectors in index.css. */
const PRESSABLE = 'button, a[href], summary, select, [role="button"], [role="tab"], [role="menuitem"], [role="option"], label[for], [data-pressable]';

/** How long `data-released` stays, which has to outlast the release animation. */
export const RELEASE_MS = 500;

function isDisabled(el: Element): boolean {
  return el.matches(':disabled, [aria-disabled="true"], [data-disabled]');
}

export function initPressFeedback(root: Document = document): () => void {
  let pressed: HTMLElement | null = null;
  const timers = new Map<HTMLElement, number>();

  function release() {
    const el = pressed;
    if (!el) return;
    pressed = null;
    el.removeAttribute('data-pressed');
    el.setAttribute('data-released', '');
    window.clearTimeout(timers.get(el));
    timers.set(el, window.setTimeout(() => {
      el.removeAttribute('data-released');
      timers.delete(el);
    }, RELEASE_MS));
  }

  function press(event: Event) {
    const pointer = event as PointerEvent;
    // Only the main button of a mouse; touch and pen report 0 as well.
    if (pointer.button !== undefined && pointer.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const el = target.closest<HTMLElement>(PRESSABLE);
    if (!el || isDisabled(el)) return;

    release();
    window.clearTimeout(timers.get(el));
    timers.delete(el);
    el.removeAttribute('data-released');
    el.setAttribute('data-pressed', '');
    pressed = el;
  }

  root.addEventListener('pointerdown', press, { passive: true });
  root.addEventListener('pointerup', release, { passive: true });
  root.addEventListener('pointercancel', release, { passive: true });
  // A drag that leaves the window never delivers its pointerup here.
  window.addEventListener('blur', release);

  return () => {
    root.removeEventListener('pointerdown', press);
    root.removeEventListener('pointerup', release);
    root.removeEventListener('pointercancel', release);
    window.removeEventListener('blur', release);
    for (const id of timers.values()) window.clearTimeout(id);
    timers.clear();
  };
}
