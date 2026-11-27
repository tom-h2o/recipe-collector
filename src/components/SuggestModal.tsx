import { useRef, useState } from 'react';
import { ChevronRight, Loader2, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/Sheet';
import { parseIngredients } from '@/lib/recipeUtils';
import { useT, tn, translateMessage } from '@/i18n';
import type { Recipe } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecipe: (r: Recipe) => void;
}

/**
 * "What can I cook?": type what is in the house, get the recipes from your
 * own vault that fit best.
 *
 * Drawn in the app's own language: the sheet every short task uses, the
 * vault's search field, the green primary button, serif recipe titles. It
 * used to be a violet button and icon on a default dialog, opened from an
 * orange button, colours nothing else here has. Progress and failures are
 * said in the sheet, not in a toast in the corner, and what was typed is kept.
 */
export function SuggestModal({ isOpen, onClose, onSelectRecipe }: Props) {
  const [ingredientInput, setIngredientInput] = useState('');
  const [suggested, setSuggested] = useState<Recipe[] | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const t = useT();

  async function handleSuggest(e: React.FormEvent) {
    e.preventDefault();
    const ingredients = ingredientInput.split(',').map((s) => s.trim()).filter(Boolean);
    if (ingredients.length === 0) return;
    setIsSuggesting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ? translateMessage(data.error) : t('The suggestions could not be made.'));
      setSuggested(data.suggestions || []);
    } catch (err: unknown) {
      setSuggested(null);
      setError(err instanceof Error && err.message ? err.message : t('The suggestions could not be made. Please try again.'));
    } finally {
      setIsSuggesting(false);
    }
  }

  function handleClose() {
    onClose();
    setSuggested(null);
    setIngredientInput('');
    setError(null);
  }

  return (
    <Sheet
      open={isOpen}
      onClose={handleClose}
      title={t('What can I cook?')}
      description={t('Type what you have, separated by commas. You get the recipes from your vault that fit best.')}
      initialFocus={input}
      className="sm:max-w-lg"
    >
      <form onSubmit={handleSuggest} className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-sk-outline dark:text-muted-foreground pointer-events-none" aria-hidden="true" />
          <input
            ref={input}
            value={ingredientInput}
            onChange={(e) => { setIngredientInput(e.target.value); setError(null); }}
            aria-label={t('Ingredients you have')}
            placeholder={t('tomatoes, pasta, garlic…')}
            enterKeyHint="search"
            className="w-full h-10 pl-10 pr-3 rounded-xl border-0 bg-sk-surface-highest dark:bg-input text-sk-on-surface dark:text-foreground text-sm font-sans focus:outline-none focus:ring-2 focus:ring-sk-primary/25 dark:focus:ring-primary/25 transition placeholder:text-sk-outline dark:placeholder:text-muted-foreground"
          />
        </div>
        <Button
          type="submit"
          disabled={isSuggesting || !ingredientInput.trim()}
          className="h-10 shrink-0 rounded-full px-5 bg-sk-primary hover:bg-sk-primary-container text-white dark:text-primary-foreground border-0"
        >
          {t('Suggest')}
        </Button>
      </form>

      <div aria-live="polite">
        {isSuggesting && (
          <p className="mt-5 flex items-center gap-2 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('Looking through your vault…')}
          </p>
        )}
      </div>

      {error && !isSuggesting && (
        <p role="alert" className="mt-5 p-3 rounded-xl bg-destructive/8 border border-destructive/20 text-sm text-destructive">{error}</p>
      )}

      {suggested !== null && !isSuggesting && (
        <section aria-label={t('Suggestions')} className="mt-5 pt-4 border-t border-sk-outline-variant/40 dark:border-border">
          {suggested.length === 0 ? (
            <>
              <p className="font-serif text-lg text-sk-on-surface dark:text-foreground">{t('Nothing fits yet')}</p>
              <p className="mt-1 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                {t('No recipe in your vault matches these well. Try a staple or two more, or leave one out.')}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-[11px] font-sans font-semibold uppercase tracking-[0.12em] text-sk-on-surface-variant dark:text-muted-foreground">
                {tn(suggested.length, '{n} recipe fits', '{n} recipes fit')}
              </h3>
              <ul className="mt-2 -mx-2 space-y-0.5">
                {suggested.map((recipe) => (
                  <li key={recipe.id}>
                    <button
                      type="button"
                      onClick={() => { handleClose(); onSelectRecipe(recipe); }}
                      className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-sk-surface-low dark:hover:bg-muted transition-colors"
                    >
                      <span className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-sk-primary-fixed/50 dark:bg-primary/15 flex items-center justify-center font-serif text-xl text-sk-primary/50 dark:text-primary/60">
                        {recipe.image_url
                          ? <img src={recipe.image_url} alt="" className="w-full h-full object-cover" />
                          : (recipe.title[0] ?? '').toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-serif text-base text-sk-on-surface dark:text-foreground truncate">{recipe.title}</span>
                        <span className="block mt-0.5 text-xs font-sans text-sk-on-surface-variant dark:text-muted-foreground line-clamp-2">
                          {parseIngredients(recipe.ingredients).map((i) => i.name).join(' · ')}
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0 text-sk-outline-variant dark:text-muted-foreground/50" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </Sheet>
  );
}
