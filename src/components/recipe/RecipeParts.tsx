import type { ReactNode } from 'react';
import { Clock, ExternalLink } from 'lucide-react';
import type { Nutrition } from '@/types';
import { useT } from '@/i18n';

/**
 * The pieces a recipe is drawn from, shared by the recipe drawer
 * (`RecipeDetail`) and the admin's view of someone's recipe
 * (`AdminRecipeView`). They used to exist only inside the drawer, so the admin
 * view borrowed the public share page instead, pitch to strangers included.
 * Restyle a piece here and both change together.
 */

/** The picture across the top, or the title's first letter on a soft gradient. */
export function RecipeHero({ imageUrl, title }: { imageUrl?: string | null; title: string }) {
  return (
    <div className="w-full h-32 sm:h-44 md:h-64 overflow-hidden shrink-0 rounded-t-3xl relative">
      {imageUrl ? (
        <img src={imageUrl} className="w-full h-full object-cover" alt={title} />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-sk-primary-fixed via-sk-surface-low to-sk-surface-highest dark:from-primary/20 dark:via-muted dark:to-muted">
          <span className="text-[6rem] sm:text-[8rem] font-serif font-normal text-sk-primary/20 dark:text-primary/15 select-none leading-none">
            {title?.[0]?.toUpperCase() ?? '?'}
          </span>
        </div>
      )}
    </div>
  );
}

/** The small capitals over Ingredients, Instructions and the like. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-sans text-xs font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground mb-4">
      {children}
    </h3>
  );
}

/** A faint rule between the sections below the method. */
export function SectionRule({ className = 'mb-6' }: { className?: string }) {
  return <div className={`h-px bg-gradient-to-r from-transparent via-sk-outline-variant/20 to-transparent ${className}`} />;
}

/** Ingredients as tonal rows, amount first; no dividers. */
export function IngredientTable({ ingredients }: { ingredients: { amount?: string | null; name: string; details?: string | null }[] }) {
  return (
    <div className="rounded-xl overflow-hidden bg-sk-surface-low dark:bg-muted">
      <table className="w-full text-sm">
        <tbody>
          {ingredients.map((ing, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-sk-surface-low dark:bg-muted' : 'bg-white dark:bg-card/50'}>
              <td className="py-2.5 px-4 font-semibold font-sans text-sk-primary dark:text-primary whitespace-nowrap w-1/3">
                {ing.amount || '—'}
              </td>
              <td className="py-2.5 px-4 font-sans text-sk-on-surface dark:text-foreground">
                {ing.name}
                {ing.details ? <span className="text-sk-on-surface-variant dark:text-muted-foreground">, {ing.details}</span> : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Four tiles, per serving. Never multiplied when the recipe is scaled: the
 * figures are per serving (NUTRITION_TEMPLATE has the model divide by the
 * number of servings), and a serving does not change with the size of the
 * batch. Scaling them once made 8 servings report twice the calories each.
 */
export function NutritionTiles({ nutrition }: { nutrition: Nutrition }) {
  const t = useT();
  const fmt = (v: number) => Math.round(v);
  return (
    <div className="mt-4">
      <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground mb-2">
        {t('Per serving')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: t('Calories'), value: fmt(nutrition.calories), unit: 'kcal' },
          { label: t('Protein'), value: fmt(nutrition.protein_g), unit: 'g' },
          { label: t('Carbs'), value: fmt(nutrition.carbs_g), unit: 'g' },
          { label: t('Fat'), value: fmt(nutrition.fat_g), unit: 'g' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl p-2.5 text-center bg-sk-surface-low dark:bg-muted">
            <div className="font-sans text-lg font-bold text-sk-primary dark:text-primary">
              {stat.value}<span className="text-xs font-medium ml-0.5 text-sk-on-surface-variant">{stat.unit}</span>
            </div>
            <div className="font-sans text-[10px] uppercase tracking-widest font-semibold text-sk-outline dark:text-muted-foreground mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The method, one numbered circle per step; a leading "Step 3:" is dropped, the circle says it. */
export function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-5">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-4">
          <span className="shrink-0 w-7 h-7 rounded-full bg-sk-primary-fixed dark:bg-primary/20 text-sk-on-primary-fixed dark:text-primary flex items-center justify-center text-sm font-bold font-sans mt-0.5">
            {i + 1}
          </span>
          <p className="font-sans text-sk-on-surface dark:text-foreground leading-relaxed">
            {step.replace(/^step\s*\d+[.:)]\s*/i, '')}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Prep and cook time, whichever are known; nothing when neither is. */
export function RecipeTimes({ prep, cook }: { prep?: number | null; cook?: number | null }) {
  const t = useT();
  const hasPrep = prep != null && prep > 0;
  const hasCook = cook != null && cook > 0;
  if (!hasPrep && !hasCook) return null;
  return (
    <div className="inline-flex items-center gap-1.5 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
      <Clock className="w-4 h-4" />
      {hasPrep && <span>{t('Prep {n}m', { n: prep })}</span>}
      {hasPrep && hasCook && <span className="text-sk-outline-variant">·</span>}
      {hasCook && <span>{t('Cook {n}m', { n: cook })}</span>}
    </div>
  );
}

/** The site's name, or failing that its host, for a link back to where the recipe came from. */
function sourceLabel(sourceUrl?: string | null, sourceName?: string | null): string | null {
  if (sourceName) return sourceName;
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return sourceUrl;
  }
}

/** Where the recipe came from: a link when there is an address, plain text when only a name. */
export function SourceLink({ sourceUrl, sourceName }: { sourceUrl?: string | null; sourceName?: string | null }) {
  const label = sourceLabel(sourceUrl, sourceName);
  if (!label) return null;
  return sourceUrl ? (
    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-sans text-sk-outline hover:text-sk-primary dark:hover:text-primary transition-colors">
      <ExternalLink className="w-3.5 h-3.5" />
      {label}
    </a>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm font-sans text-sk-outline">
      <ExternalLink className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}
