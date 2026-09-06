import { useEffect } from 'react';

/**
 * Names the printed file after the recipe.
 *
 * Browsers use document.title as the default filename for "Save as PDF", so
 * without this every exported recipe arrives as "Speisekammer.pdf" and a folder
 * of them is unusable. Restored afterwards so the tab title is unchanged.
 */
export function usePrintTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;

    const original = document.title;
    // Characters that browsers or filesystems would mangle in a filename.
    const safe = title.replace(/[\\/:*?"<>|]/g, '-').trim();
    if (!safe) return;

    const before = () => { document.title = safe; };
    const after = () => { document.title = original; };

    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      // The dialog can close mid-print; never strand a renamed tab.
      document.title = original;
    };
  }, [title]);
}
