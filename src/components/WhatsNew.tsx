import { Sparkles, X } from 'lucide-react';
import { useFocusTrap, useReturnFocus } from '@/components/ui/useFocusTrap';
import { Button } from '@/components/ui/button';
import type { ReleaseNote } from '@/lib/changelog';
import { useT, tn, dateLocale } from '@/i18n';

interface Props {
  isOpen: boolean;
  releases: ReleaseNote[];
  /** Shown above the list when the reader is catching up rather than browsing. */
  unreadCount: number;
  onClose: () => void;
}

function formatDate(id: string): string {
  const d = new Date(`${id}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? id
    : d.toLocaleDateString(dateLocale(), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function WhatsNew({ isOpen, releases, unreadCount, onClose }: Props) {
  if (!isOpen) return null;
  return <WhatsNewDialog releases={releases} unreadCount={unreadCount} onClose={onClose} />;
}

/**
 * Split out so the focus hooks mount and unmount with the dialog itself. Calling
 * them in the wrapper would run useReturnFocus on every render of a closed
 * dialog, capturing the wrong element to return focus to.
 */
function WhatsNewDialog({ releases, unreadCount, onClose }: Omit<Props, 'isOpen'>) {
  const t = useT();
  const handleTrapKeyDown = useFocusTrap();
  useReturnFocus();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { onClose(); return; }
          handleTrapKeyDown(e);
        }}
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
      >
        <div className="shrink-0 flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 id="whats-new-title" className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-50">
              <Sparkles className="w-5 h-5 text-sk-primary" aria-hidden="true" /> {t("What's new")}
            </h2>
            {unreadCount > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {tn(unreadCount, '{n} update since your last visit', '{n} updates since your last visit')}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={t("Close what's new")}
            className="shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Focusable and named: once the notes are long enough to scroll,
            someone using only a keyboard has to be able to reach and scroll
            this region. axe flags it as scrollable-region-focusable, which is
            what caught it when a longer release entry was added. */}
        <div
          tabIndex={0}
          role="region"
          aria-label={t('Release notes')}
          className="flex-1 overflow-y-auto px-5 pb-2 space-y-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sk-primary/40 rounded-lg"
        >
          {releases.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">{t('Nothing to report yet.')}</p>
          ) : (
            releases.map((release) => (
              <section key={release.id}>
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{t(release.title)}</h3>
                <p className="text-[11px] uppercase tracking-widest text-zinc-600 dark:text-zinc-400 mb-2">
                  {formatDate(release.id)}
                </p>
                <ul className="space-y-1.5">
                  {release.items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <span aria-hidden="true" className="mt-1.5 w-1 h-1 rounded-full bg-sk-primary shrink-0" />
                      <span>{t(item)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="shrink-0 p-5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <Button
            onClick={onClose}
            className="w-full bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground font-semibold border-0 rounded-full"
          >
            {t('Got it')}
          </Button>
        </div>
      </div>
    </div>
  );
}
