import { useEffect, useMemo, useState } from 'react';
import { ChefHat, Users, Printer, Play, Minus, Plus, RotateCcw, ArrowRight, Languages, Thermometer } from 'lucide-react';
import { parseIngredients, scaleAmount } from '@/lib/recipeUtils';
import { convertTemperaturesInText } from '@/lib/temperatureUtils';
import { CookMode } from '@/components/CookMode';
import { SpeisekammerLogo } from '@/components/SpeisekammerLogo';
import { usePrintTitle } from '@/hooks/usePrintTitle';
import { supabase } from '@/lib/supabase';
import { LANGUAGES } from '@/lib/constants';
import { APP_NAME, AUTHOR_NAME, AUTHOR_URL, CAPABILITY_GROUPS, capabilityText } from '@/lib/appInfo';
import { useT } from '@/i18n';
import { rich } from '@/i18n/rich';
import { isSignupOpen } from '@/lib/signupOpen';
import type { Ingredient, Recipe } from '@/types';

/**
 * A handful of highlights for the guest, taken from the same list the About
 * page renders so the two cannot drift. One per group, which keeps the pitch
 * short and still covers the span of the app.
 */
const HIGHLIGHTS = CAPABILITY_GROUPS.map((g) => g.items[0]);

interface SharedTranslation {
  language_code: string;
  title: string;
  description: string | null;
  instructions: string;
  ingredients: Ingredient[];
}

interface SharedImage {
  url: string;
  source: string;
  sort_order: number;
}

interface Props {
  recipe: Recipe;
  /**
   * The share token, when this page was reached through a public link. The
   * gallery and the cached translations hang off it; the legacy /recipe/:id
   * route has no token and simply goes without them.
   */
  shareToken?: string | null;
}

/**
 * The page behind a public share link. Rendered for visitors with no account,
 * so everything here must work without auth: scaling, unit conversion and
 * cook mode are client-side maths, and the translations are ones the owner
 * already paid for, read straight from the cache.
 *
 * No AI endpoint is reachable from this page. They all require a Bearer token
 * and are rate-limited per user, so a guest can read a translation that exists
 * but can never cause one to be made.
 */
export function PublicRecipe({ recipe, shareToken }: Props) {
  const t = useT();
  const signupOpen = isSignupOpen();
  const baseServings = recipe.original_servings || recipe.servings || 1;
  const [servings, setServings] = useState(baseServings);
  const [isCookMode, setIsCookMode] = useState(false);
  const [unit, setUnit] = useState<'C' | 'F'>('C');
  const [language, setLanguage] = useState<string | null>(null);
  const [translations, setTranslations] = useState<SharedTranslation[]>([]);
  const [images, setImages] = useState<SharedImage[]>([]);
  const [activeImage, setActiveImage] = useState(0);

  // The gallery and the cached translations, both keyed on the share token.
  useEffect(() => {
    if (!shareToken) return;
    let cancelled = false;

    supabase.rpc('get_shared_recipe_images', { p_token: shareToken }).then(({ data }) => {
      if (!cancelled && Array.isArray(data)) setImages(data as SharedImage[]);
    });
    supabase.rpc('get_shared_recipe_translations', { p_token: shareToken }).then(({ data }) => {
      if (!cancelled && Array.isArray(data)) setTranslations(data as SharedTranslation[]);
    });

    return () => { cancelled = true; };
  }, [shareToken]);

  const active = useMemo(
    () => translations.find((tr) => tr.language_code === language) ?? null,
    [translations, language],
  );

  const scale = servings / baseServings;
  const isScaled = servings !== baseServings;

  const title = active?.title ?? recipe.title;
  const description = active?.description ?? recipe.description;

  const displayIngredients = useMemo(() => {
    const base = parseIngredients(active?.ingredients ?? recipe.ingredients);
    return base.map((i) => ({
      ...i,
      amount: isScaled ? (scaleAmount(i.amount, scale) || i.amount) : i.amount,
      details: i.details ? convertTemperaturesInText(i.details, unit) : i.details,
    }));
  }, [active, recipe.ingredients, isScaled, scale, unit]);

  const instructions = convertTemperaturesInText(active?.instructions ?? recipe.instructions, unit) ?? '';
  const steps = instructions.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  // Browsers name a "Save as PDF" file after the tab, so without this a guest's
  // export arrives called "Speisekammer — Your Curated Recipe Vault.pdf".
  usePrintTitle(title);

  // Cook mode reads off the recipe, so hand it the scaled, translated,
  // unit-converted copy — otherwise stepping into it silently reverts all three.
  const cookRecipe: Recipe = {
    ...recipe,
    title,
    ingredients: displayIngredients,
    instructions,
    servings,
  };

  const heroImages = images.length > 0 ? images : (recipe.image_url ? [{ url: recipe.image_url, source: 'upload', sort_order: 0 }] : []);
  const hero = heroImages[Math.min(activeImage, heroImages.length - 1)];
  const offeredLanguages = LANGUAGES.filter((l) => translations.some((tr) => tr.language_code === l.code));

  return (
    <>
    <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-950 md:shadow-2xl rounded-3xl overflow-hidden print:shadow-none print:w-full border border-zinc-200 dark:border-zinc-800 break-inside-avoid">
      {hero && (
        <div>
          <img src={hero.url} className="w-full h-64 md:h-96 object-cover" alt={title} />
          {heroImages.length > 1 && (
            <div className="print:hidden flex gap-2 p-4 overflow-x-auto bg-zinc-50 dark:bg-zinc-900/50">
              {heroImages.map((img, idx) => (
                <button
                  key={img.url}
                  onClick={() => setActiveImage(idx)}
                  aria-label={t('Show photo {n}', { n: idx + 1 })}
                  aria-current={idx === activeImage}
                  className={`shrink-0 rounded-xl overflow-hidden border-2 transition-colors ${
                    idx === activeImage ? 'border-sk-primary' : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <img src={img.url} className="w-16 h-16 object-cover" alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-8 md:p-12 space-y-8">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-black mb-4">{title}</h1>
            {description && (
              <p className="text-lg text-zinc-600 dark:text-zinc-400">{description}</p>
            )}
          </div>
          <div className="print:hidden flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsCookMode(true)}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground font-bold transition"
            >
              <Play className="w-4 h-4" /> {t('Cook')}
            </button>
            <button
              onClick={() => window.print()}
              aria-label={t('Print this recipe')}
              className="p-3 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition text-zinc-600 dark:text-zinc-300"
            >
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Servings, units and language. All printed output keeps whatever the reader chose. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-3 bg-sk-primary-fixed/40 text-sk-primary px-4 py-2 rounded-full font-bold">
            <Users className="w-4 h-4" />
            <button
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              disabled={servings <= 1}
              aria-label={t('Fewer servings')}
              className="print:hidden p-1 rounded-full hover:bg-sk-primary/10 disabled:opacity-40 transition"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span aria-live="polite">{t('Serves {n}', { n: servings })}</span>
            <button
              onClick={() => setServings((s) => s + 1)}
              aria-label={t('More servings')}
              className="print:hidden p-1 rounded-full hover:bg-sk-primary/10 transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {isScaled && (
            <button
              onClick={() => setServings(baseServings)}
              className="print:hidden inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-sk-primary dark:text-zinc-400 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {t('Reset to {n}', { n: baseServings })}
            </button>
          )}

          <button
            onClick={() => setUnit((u) => (u === 'C' ? 'F' : 'C'))}
            aria-label={unit === 'C' ? t('Show temperatures in Fahrenheit') : t('Show temperatures in Celsius')}
            className="print:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-sk-primary hover:text-sk-primary dark:hover:text-primary transition"
          >
            <Thermometer className="w-3.5 h-3.5" /> °{unit}
          </button>

          {offeredLanguages.length > 0 && (
            <div className="print:hidden inline-flex items-center gap-1.5 flex-wrap">
              <Languages className="w-3.5 h-3.5 text-zinc-400" />
              <button
                onClick={() => setLanguage(null)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                  language === null
                    ? 'bg-sk-primary-fixed/50 text-sk-primary'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-sk-primary dark:hover:text-primary'
                }`}
              >
                {t('Original')}
              </button>
              {offeredLanguages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l.code)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                    language === l.code
                      ? 'bg-sk-primary-fixed/50 text-sk-primary'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-sk-primary dark:hover:text-primary'
                  }`}
                >
                  {l.flag} {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 border-b pb-2">
                <ChefHat className="text-sk-primary w-6 h-6" /> {t('Ingredients')}
              </h2>
              <ul className="space-y-3">
                {displayIngredients.map((i, idx) => (
                  <li key={idx} className="flex items-start gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                    <div className="w-2 h-2 mt-2 rounded-full bg-sk-primary shrink-0" />
                    {i.amount && <span className="font-bold text-sk-primary">{i.amount}</span>}
                    <span className="text-zinc-800 dark:text-zinc-200">
                      {i.name}
                      {i.details ? <span className="text-zinc-500 dark:text-zinc-400">, {i.details}</span> : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {recipe.nutrition && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
                  {t('Per serving')}
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: t('Calories'), value: Math.round(recipe.nutrition.calories), unit: 'kcal' },
                    { label: t('Protein'), value: Math.round(recipe.nutrition.protein_g), unit: 'g' },
                    { label: t('Carbs'), value: Math.round(recipe.nutrition.carbs_g), unit: 'g' },
                    { label: t('Fat'), value: Math.round(recipe.nutrition.fat_g), unit: 'g' },
                    { label: t('Fibre'), value: Math.round(recipe.nutrition.fiber_g), unit: 'g' },
                  ].map((n) => (
                    <div key={n.label} className="rounded-xl bg-zinc-50 dark:bg-zinc-900 px-3 py-2">
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{n.label}</div>
                      <div className="font-bold text-zinc-800 dark:text-zinc-100">
                        {n.value}<span className="text-xs font-medium text-zinc-500 ml-0.5">{n.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Deliberately not scaled: a per-serving figure is the same
                    however many servings you cook. */}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-4 border-b pb-2">{t('Instructions')}</h2>
            <ol className="space-y-6 list-decimal list-outside ml-5">
              {steps.map((step, idx) => (
                <li key={idx} className="text-zinc-700 dark:text-zinc-300 pl-2 leading-relaxed font-medium">{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <CookMode recipe={cookRecipe} isOpen={isCookMode} onClose={() => setIsCookMode(false)} />
    </div>

    {/*
      The pitch. print:hidden throughout — someone printing this wants the
      recipe for the kitchen wall, not an advert for the app.
    */}
    <aside className="print:hidden max-w-3xl mx-auto mt-10 space-y-8">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 md:p-10 space-y-8">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <SpeisekammerLogo size={32} />
            <h2 className="font-serif text-2xl font-normal text-sk-primary dark:text-primary tracking-tight">
              {APP_NAME}
            </h2>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {t('Someone sent you this from their recipe vault. It is where they keep every recipe worth cooking twice — pulled in from links, cookbook photos and PDFs, then searchable, scalable and ready for the week ahead.')}
            {signupOpen ? ` ${t('You can have one too.')}` : ''}
          </p>
        </div>

        <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            const { title: itemTitle, blurb } = capabilityText(item, t);
            return (
              <li key={item.title} className="flex gap-3">
                <span className="shrink-0 w-9 h-9 rounded-full bg-sk-primary-fixed/50 dark:bg-primary/15 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-sk-primary dark:text-primary" />
                </span>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{itemTitle}</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{blurb}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          {signupOpen && (
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground font-semibold transition-colors"
            >
              {t('Create a free account')} <ArrowRight className="w-4 h-4" />
            </a>
          )}
          <a
            href="/about"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-zinc-200 dark:border-zinc-800 font-semibold text-zinc-700 dark:text-zinc-300 hover:border-sk-primary hover:text-sk-primary dark:hover:text-primary transition-colors"
          >
            {t('See everything it does')}
          </a>
        </div>
      </div>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-500 pb-4">
        {rich(t, '{app} is designed and built by <author>{name}</author>.', {
          author: (name) => (
            <a
              href={AUTHOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-zinc-700 dark:text-zinc-300 hover:text-sk-primary dark:hover:text-primary hover:underline"
            >
              {name}
            </a>
          ),
        }, { app: APP_NAME, name: AUTHOR_NAME })}
      </p>
    </aside>
    </>
  );
}
