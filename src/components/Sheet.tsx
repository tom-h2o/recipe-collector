import type { ReactNode, RefObject } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title. */
  description?: ReactNode;
  children: ReactNode;
  /** What takes focus on opening; the first control otherwise. */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * The app's panel for a short task or a list of choices: a sheet rising from
 * the bottom edge on a phone, where a thumb reaches it and the screen behind
 * stays visible above it, and a centred dialog from `sm` up.
 *
 * Built on the Dialog primitive, so it traps focus, closes on Escape and on a
 * tap beside it, and returns focus to what opened it. The title is the serif
 * the rest of the app uses for headings; the surface is opaque, like every
 * dialog (glass is for bars and menus).
 *
 * On a phone the sheet runs to the bottom edge and pads its content by the
 * home indicator's strip, so nothing tappable sits under it.
 */
export function Sheet({ open, onClose, title, description, children, initialFocus, className }: Props) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        initialFocus={initialFocus}
        className={cn(
          // Phone: pinned to the bottom, full width, rounded on top only.
          'top-auto bottom-0 left-0 translate-x-0 translate-y-0 w-full max-w-none rounded-t-3xl rounded-b-none',
          'max-h-[calc(100dvh-var(--safe-top)-2rem)] overflow-y-auto gap-0 p-0',
          'pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)]',
          'bg-white dark:bg-card text-sk-on-surface dark:text-foreground ring-sk-outline-variant/40 dark:ring-border shadow-xl',
          'data-open:zoom-in-100 data-closed:zoom-out-100 data-open:slide-in-from-bottom-6 sm:data-open:slide-in-from-bottom-0 sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95',
          // From sm: the centred dialog, clear of both safe-area strips.
          'sm:top-[var(--dialog-top)] sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md sm:rounded-2xl',
          'sm:max-h-[var(--dialog-max-h)] sm:pb-0 sm:pl-0 sm:pr-0',
          className,
        )}
      >
        <div aria-hidden="true" className="sm:hidden mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-sk-outline-variant dark:bg-border" />
        <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:pt-5 pb-3">
          <div className="min-w-0">
            <DialogTitle className="font-serif text-xl font-normal text-sk-on-surface dark:text-foreground">{title}</DialogTitle>
            {description && (
              <DialogDescription className="mt-1 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                {description}
              </DialogDescription>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            className="shrink-0 -mr-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-sk-outline dark:text-muted-foreground hover:bg-sk-surface-low dark:hover:bg-muted hover:text-sk-on-surface dark:hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
