import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/**
 * Where the tinted pill of a tab bar sits: under the tab marked
 * `aria-current="page"` (the app's navigation), or whatever `selector` names
 * (`[aria-selected="true"]` for a tablist, SegmentedTabs).
 *
 * The tabs are not equally wide (their labels differ), so the position cannot
 * be worked out from the index alone. It is measured, and measured again when
 * the bar changes size: a rotated phone, a badge appearing, a font arriving.
 *
 * `ready` stays false until the first measurement has been painted. Without
 * it the pill would animate in from the left edge on every page load.
 */
export function usePillPosition(containerRef: RefObject<HTMLElement | null>, activeKey: string, selector = '[aria-current="page"]'): {
  style: CSSProperties;
  ready: boolean;
} {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const active = container.querySelector<HTMLElement>(selector);
      if (!active) { setBox(null); return; }
      const next = { left: active.offsetLeft, width: active.offsetWidth };
      setBox((prev) => (prev && prev.left === next.left && prev.width === next.width ? prev : next));
    };

    measure();
    // Not available in every test environment; the first measurement stands.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const child of Array.from(container.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [containerRef, activeKey, selector]);

  useLayoutEffect(() => {
    if (!box || ready) return;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [box, ready]);

  return {
    ready,
    style: box
      ? { width: box.width, transform: `translateX(${box.left}px)`, opacity: 1 }
      : { opacity: 0 },
  };
}
