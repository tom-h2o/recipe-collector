import { ImageUp, Loader2, X } from 'lucide-react';
import type { RecipeImport } from '@/hooks/useRecipeImports';
import { tn, translateMessage, useT } from '@/i18n';

/**
 * What arrived from the iPhone Shortcuts since the person last looked: recipes
 * saved (with a way to show just those), recipes still being read, and
 * pictures, Safari pages or shared links that could not be read, each with
 * its reason.
 * Nothing is shown when there is nothing new.
 */
interface Props {
  newCount: number;
  processing: RecipeImport[];
  failed: RecipeImport[];
  showingNew: boolean;
  onShowNew: () => void;
  onDismiss: (importId: string) => void;
}

export function ImportBanner({ newCount, processing, failed, showingNew, onShowNew, onDismiss }: Props) {
  const t = useT();
  if (newCount === 0 && processing.length === 0 && failed.length === 0) return null;
  const pages = processing.reduce((n, i) => n + i.page_count, 0);
  const reading = processing.length === 1
    ? processing[0].source === 'page'
      ? t('Reading a page from Safari…')
      : processing[0].source === 'link'
        ? t('Reading a shared link…')
        : tn(pages, 'Reading a picture from your photos…', 'Reading {n} pages from your photos…')
    : t('Reading {n} recipes from your iPhone…', { n: processing.length });

  return (
    <section
      aria-label={t('Recipes from your iPhone')}
      className="mb-5 rounded-2xl border border-sk-outline-variant/50 dark:border-border bg-white dark:bg-card px-4 py-3 space-y-2 font-sans"
    >
      {newCount > 0 && (
        <div className="flex items-center gap-3">
          <ImageUp className="w-5 h-5 shrink-0 text-sk-primary dark:text-primary" aria-hidden="true" />
          <p className="flex-1 text-sm font-semibold text-sk-on-surface dark:text-foreground">
            {tn(newCount, '1 new recipe from your iPhone', '{n} new recipes from your iPhone')}
          </p>
          {!showingNew && (
            <button
              type="button"
              onClick={onShowNew}
              className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold bg-sk-primary text-white dark:bg-primary dark:text-primary-foreground"
            >
              {t('Show')}
            </button>
          )}
        </div>
      )}
      {processing.length > 0 && (
        <div className="flex items-center gap-3 text-sm text-sk-on-surface-variant dark:text-muted-foreground">
          <Loader2 className="w-5 h-5 shrink-0 animate-spin" aria-hidden="true" />
          <p>{reading}</p>
        </div>
      )}
      {failed.map((f) => (
        <div key={f.id} className="flex items-start gap-3 text-sm">
          <ImageUp className="w-5 h-5 shrink-0 text-destructive" aria-hidden="true" />
          <p className="flex-1 text-sk-on-surface dark:text-foreground">
            <span className="font-semibold">
              {f.source === 'page'
                ? t('A page from Safari could not be read.')
                : f.source === 'link'
                  ? t('A shared link could not be read.')
                  : tn(f.page_count, 'A picture could not be read.', '{n} pages could not be read.')}
            </span>{' '}
            <span className="text-sk-on-surface-variant dark:text-muted-foreground">{f.error ? translateMessage(f.error) : f.error}</span>
          </p>
          <button
            type="button"
            onClick={() => onDismiss(f.id)}
            aria-label={t('Dismiss')}
            className="shrink-0 p-1 rounded-full text-sk-outline hover:text-sk-on-surface dark:text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </section>
  );
}
