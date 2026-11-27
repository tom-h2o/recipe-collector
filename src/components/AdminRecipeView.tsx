import type { ReactNode } from 'react';
import { Pencil, RefreshCw, Loader2, ShieldCheck, Users, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parseIngredients } from '@/lib/recipeUtils';
import { TagIcon, tagClass, tagLabel } from '@/lib/tags';
import type { Recipe } from '@/types';
import { useT, tn, dateLocale } from '@/i18n';
import { rich } from '@/i18n/rich';
import {
  IngredientTable, NutritionTiles, RecipeHero, RecipeTimes, SectionLabel, SectionRule, SourceLink, StepList,
} from '@/components/recipe/RecipeParts';

interface Props {
  /** The full row; null while it is on its way. */
  recipe: Recipe | null;
  /** From the list row, so the title and picture show while the recipe loads. */
  title: string;
  imageUrl?: string | null;
  ownerEmail: string | null;
  onClose: () => void;
  onEdit: (recipe: Recipe) => void;
  onRegenerate: (kind: 'tag' | 'nutrition') => void;
  regenerating: 'tag' | 'nutrition' | null;
  /**
   * The edit form. Rendered inside this dialog, not beside it: two modal
   * dialogs side by side each treat the other as outside, so Escape closes
   * the wrong one and neither can be clicked into (see RecipeDetail).
   */
  nestedDialogs?: ReactNode;
}

const ACTION =
  'inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold font-sans transition-colors disabled:opacity-50 ' +
  'bg-sk-primary-fixed/40 text-sk-primary hover:bg-sk-primary-fixed/70 dark:bg-primary/15 dark:text-primary dark:hover:bg-primary/25';

function addedOn(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(dateLocale('en-GB'), { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Someone's recipe as the admin sees it: drawn like the recipe drawer
 * (`RecipeDetail`, from the same parts), with whose it is and the admin's
 * three actions in place of Cook, translate and share. It used to be the
 * public share page inside a dark overlay, so it ended with the pitch written
 * for strangers ("Someone sent you this… Create a free account").
 *
 * Not shown: the owner's private notes, their ratings and the photo gallery.
 * This view is for checking and fixing a recipe, which needs none of them.
 */
export function AdminRecipeView({ recipe, title, imageUrl, ownerEmail, onClose, onEdit, onRegenerate, regenerating, nestedDialogs }: Props) {
  const t = useT();
  const ingredients = recipe ? parseIngredients(recipe.ingredients) : [];
  const steps = (recipe?.instructions ?? '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const added = addedOn(recipe?.created_at);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[780px] overflow-hidden rounded-3xl bg-white dark:bg-card border-0 shadow-ambient p-0 w-[95vw] sm:w-full"
        style={{ boxShadow: '0 24px 80px rgba(47, 49, 46, 0.12)' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Close recipe')}
          title={t('Close')}
          className="absolute top-3 right-3 z-20 p-2.5 rounded-full glass glass-dark text-white"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="overflow-y-auto max-h-[var(--dialog-max-h)]">
          <RecipeHero imageUrl={recipe?.image_url ?? imageUrl} title={recipe?.title ?? title} />

          <div className="p-4 sm:p-6 md:p-10 space-y-6 sm:space-y-8">
            <DialogHeader className="text-left space-y-3">
              <DialogTitle className="font-serif text-2xl sm:text-3xl md:text-[2.25rem] font-bold tracking-tight text-sk-on-surface dark:text-foreground leading-tight">
                {recipe?.title ?? title}
              </DialogTitle>

              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-sk-primary dark:text-primary shrink-0" aria-hidden="true" />
                <span>
                  {ownerEmail
                    ? rich(t, 'Belongs to <b>{email}</b>', { b: (text) => <span className="font-semibold text-sk-on-surface dark:text-foreground break-all">{text}</span> }, { email: ownerEmail })
                    : t('Belongs to no account')}
                </span>
                {added && <><span aria-hidden="true" className="text-sk-outline-variant">·</span><span>{t('added {date}', { date: added })}</span></>}
              </p>

              {recipe && (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <button
                    type="button"
                    onClick={() => onEdit(recipe)}
                    className="inline-flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-full bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground font-semibold font-sans text-sm transition-colors"
                  >
                    <Pencil className="w-4 h-4" /> {t('Edit')}
                  </button>
                  <button type="button" onClick={() => onRegenerate('tag')} disabled={regenerating !== null} className={ACTION}>
                    <RefreshCw className={`w-4 h-4 ${regenerating === 'tag' ? 'animate-spin' : ''}`} />
                    {regenerating === 'tag' ? t('Regenerating…') : t('Regenerate tags')}
                  </button>
                  <button type="button" onClick={() => onRegenerate('nutrition')} disabled={regenerating !== null} className={ACTION}>
                    <RefreshCw className={`w-4 h-4 ${regenerating === 'nutrition' ? 'animate-spin' : ''}`} />
                    {regenerating === 'nutrition' ? t('Regenerating…') : t('Regenerate nutrition')}
                  </button>
                </div>
              )}

              {recipe && (
                <div className="flex items-center gap-3 flex-wrap pt-1">
                  {recipe.servings ? (
                    <span className="inline-flex items-center gap-2 bg-sk-primary-fixed/30 dark:bg-primary/15 rounded-full px-3 py-1.5 text-xs font-sans font-semibold text-sk-primary dark:text-primary">
                      <Users className="w-4 h-4" aria-hidden="true" />
                      {tn(recipe.servings, '{n} serving', '{n} servings')}
                    </span>
                  ) : null}
                  <RecipeTimes prep={recipe.prep_time_mins} cook={recipe.cook_time_mins} />
                  <span className="text-sm font-sans text-sk-outline dark:text-muted-foreground">{tn(ingredients.length, '{n} ingredients##one', '{n} ingredients')}</span>
                  <SourceLink sourceUrl={recipe.source_url} sourceName={recipe.source_name} />
                </div>
              )}

              {recipe?.description && (
                <DialogDescription className="font-serif text-base font-normal text-sk-on-surface-variant dark:text-muted-foreground leading-relaxed pt-1 italic">
                  {recipe.description}
                </DialogDescription>
              )}
            </DialogHeader>

            {recipe ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-7 gap-8">
                  <div className="md:col-span-3">
                    <SectionLabel>{t('Ingredients')}</SectionLabel>
                    <IngredientTable ingredients={ingredients} />
                    {recipe.nutrition && <NutritionTiles nutrition={recipe.nutrition} />}
                  </div>
                  <div className="md:col-span-4">
                    <SectionLabel>{t('Instructions')}</SectionLabel>
                    <StepList steps={steps} />
                  </div>
                </div>

                <div className="pt-6">
                  <SectionRule />
                  <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground mb-3">{t('Tags')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(recipe.tags ?? []).map((tag) => (
                      <span key={tag} className={tagClass(false, 'md')}>
                        <TagIcon tag={tag} className="w-3.5 h-3.5 shrink-0" />
                        {t(tagLabel(tag))}
                      </span>
                    ))}
                    {(recipe.tags ?? []).length === 0 && (
                      <span className="text-xs font-sans text-sk-outline dark:text-muted-foreground">{t('No tags yet')}</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div role="status" className="flex items-center justify-center py-16 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" /> {t('Loading the recipe…')}
              </div>
            )}
          </div>
        </div>
        {nestedDialogs}
      </DialogContent>
    </Dialog>
  );
}
