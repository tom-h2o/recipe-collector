import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Users, Minus, Plus, Star, Share2, Printer, Flame, Pencil, Trash2, Clock, CalendarPlus, ExternalLink, Copy, Globe, ImageIcon, X, Sparkles, Loader2, Languages, Send, MoreHorizontal, Tag, Salad, FolderOpen, Link2Off, Check} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parseIngredients, scaleAmount } from '@/lib/recipeUtils';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { convertTemperaturesInText } from '@/lib/temperatureUtils';
import { MEAL_TYPES, DEFAULT_MEAL_TYPE, LANGUAGES, AVAILABLE_TAGS } from '@/lib/constants';
import type { Recipe, RecipeTranslation, Collection, LinkedPerson } from '@/types';
import { CookMode } from '@/components/CookMode';
import { Button } from '@/components/ui/button';
import { RecipeGallery } from '@/components/RecipeGallery';
import { useRecipeRatings } from '@/hooks/useRecipeRatings';
import { useRecipeTranslations } from '@/hooks/useRecipeTranslations';
import { AnchoredMenu } from '@/components/AnchoredMenu';
import { usePrintTitle } from '@/hooks/usePrintTitle';
import { RecipePrintSheet } from '@/components/RecipePrintSheet';
import { useRecipeImages } from '@/hooks/useRecipeImages';
import { adoptRecipe } from '@/lib/adoptRecipe';

interface Props {
  recipe: Recipe | null;
  preferredLanguage: string | null;
  temperatureUnit?: 'C' | 'F';
  translationsCache?: Record<string, RecipeTranslation>;
  onLanguageChange: (lang: string | null) => void;
  onTranslationCached: (recipeId: string, langCode: string, t: RecipeTranslation) => void;
  /** The counterpart: a translation was deleted and must not be served from memory again. */
  onTranslationRemoved?: (recipeId: string, langCode: string) => void;
  onClose: () => void;
  onEdit: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
  onSend?: (r: Recipe) => void;
  /**
   * Dialogs that open on top of this one, such as the send-to-a-friend form.
   * They are rendered inside this dialog's own tree on purpose: two modal
   * dialogs side by side each treat the other as "outside", so each hides the
   * other from assistive technology and Escape closes the wrong one. Nested,
   * the upper one is on top, and closing it leaves the recipe open.
   */
  nestedDialogs?: ReactNode;
  /** Resolves to whether the write landed; false means RLS refused it and a toast was already shown. */
  onUpdateRecipe: (id: string, changes: Partial<Recipe>) => Promise<boolean>;
  userId?: string | null;
  /** Nickname of the linked person who owns this recipe, when it is not the viewer's. */
  ownerLabel?: string | null;
  /** Connected accounts, used to name whoever else has rated this recipe. */
  linkedPeople?: LinkedPerson[];
  onAddMealPlan?: (date: string, mealType: string, recipeId: string) => Promise<void>;
  onSaveScaled?: (payload: Omit<Recipe, 'id' | 'created_at' | 'tags' | 'is_favourite' | 'nutrition' | 'rating' | 'notes' | 'user_id'>) => Promise<unknown>;
  collections?: Collection[];
  recipeCollectionIds?: string[];
  onAddToCollection?: (collectionId: string) => Promise<void>;
  onRemoveFromCollection?: (collectionId: string) => Promise<void>;
}

/** One look for every row in the options menu, so they read as one list. */
const MENU_ITEM =
  'flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium font-sans text-left transition-colors disabled:opacity-50 ' +
  'text-sk-on-surface-variant dark:text-muted-foreground hover:bg-sk-surface-low dark:hover:bg-muted hover:text-sk-primary dark:hover:text-primary';

/** For the two that take something away. */
const MENU_ITEM_DANGER =
  'flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium font-sans text-left transition-colors disabled:opacity-50 ' +
  'text-sk-on-surface-variant dark:text-muted-foreground hover:bg-destructive/10 hover:text-destructive';

/** A recipe belonging to a linked account: readable, never writable. */
function isLinkedRecipe(recipe: Recipe | null, userId?: string | null): boolean {
  return !!recipe && !!userId && !!recipe.user_id && recipe.user_id !== userId;
}

export function RecipeDetail({ recipe, preferredLanguage, temperatureUnit = 'C', translationsCache, onLanguageChange, onTranslationCached, onTranslationRemoved, onClose, onEdit, onDelete, onSend, nestedDialogs, onUpdateRecipe, userId, ownerLabel, linkedPeople = [], onAddMealPlan, onSaveScaled, collections, recipeCollectionIds, onAddToCollection, onRemoveFromCollection }: Props) {
  const baseServings0 = recipe?.original_servings || recipe?.servings || 1;
  const [scaledServings, setScaledServings] = useState(baseServings0);
  const [aiIngredients, setAiIngredients] = useState<{ amount: string; name: string; details: string }[] | null>(null);
  const [isAiScaling, setIsAiScaling] = useState(false);
  const [isSavingScaled, setIsSavingScaled] = useState(false);
  const [isCookMode, setIsCookMode] = useState(false);
  const { images, busy: galleryBusy, fetchImages, addImages, deleteImage } = useRecipeImages(recipe?.id ?? null, userId ?? null);
  const { myRating, otherRatings, busy: ratingBusy, setRating } = useRecipeRatings(recipe?.id ?? null, userId ?? null);
  // Which languages already exist in the cache, so the picker can say which
  // ones are free to open and which would cost another Gemini call.
  const { languages: cachedLanguages, removing: removingLanguage, remove: removeTranslation, refresh: refreshTranslations } =
    useRecipeTranslations(recipe?.id ?? null, !isLinkedRecipe(recipe, userId));

  useEffect(() => { fetchImages(); }, [fetchImages]);

  // A recipe from a linked account is read-only: RLS refuses writes, so the
  // owner-only controls are disabled rather than left to fail on click.
  const isLinked = isLinkedRecipe(recipe, userId);
  const [adopting, setAdopting] = useState(false);

  // ---- Public share link -------------------------------------------------
  // The link is keyed on a random token, not on recipe.id, so sharing is
  // opt-in and revocable. Setting the token back to null takes the link down.
  const [shareBusy, setShareBusy] = useState(false);
  const shareToken = recipe?.public_share_token ?? null;
  const shareUrl = shareToken ? `${window.location.origin}/r/${shareToken}` : null;

  async function copyToClipboard(url: string, created: boolean) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(created ? 'Public link created and copied' : 'Public link copied');
    } catch {
      // Clipboard access can be refused (insecure context, denied permission).
      // The link still exists, so say so rather than implying a failure.
      toast.success(created ? 'Public link created' : 'Public link ready', {
        description: url,
      });
    }
  }

  async function handleCreateShareLink() {
    if (!recipe || shareBusy) return;
    setShareBusy(true);
    try {
      const token = crypto.randomUUID();
      // Copy only after the token is actually stored. Copying first is how the
      // old button came to hand out links that led to a login screen.
      const saved = await onUpdateRecipe(recipe.id, { public_share_token: token });
      if (!saved) return;
      await copyToClipboard(`${window.location.origin}/r/${token}`, true);
    } finally {
      setShareBusy(false);
      setShowMoreOptions(false);
    }
  }

  async function handleStopSharing() {
    if (!recipe || shareBusy) return;
    setShareBusy(true);
    try {
      const saved = await onUpdateRecipe(recipe.id, { public_share_token: null });
      if (saved) toast.success('Link turned off. Anyone holding it now sees nothing.');
    } finally {
      setShareBusy(false);
      setShowMoreOptions(false);
    }
  }

  /**
   * Who can actually read a note on your own recipe. It used to be labelled
   * "Personal Notes", which was never true: recipes_select hands the whole row
   * to linked accounts, and the admin recipe view selects '*', so notes reach
   * both. The label now says so rather than implying privacy the app does not
   * provide.
   */
  const noteAudience = linkedPeople.length > 0
    ? `Visible to ${linkedPeople.map((p) => p.label).join(', ')} and to an app administrator.`
    : 'Visible to an app administrator.';

  async function handleAdopt() {
    if (!recipe || !userId) return;
    setAdopting(true);
    try {
      await adoptRecipe(recipe as unknown as Record<string, unknown>, userId);
      toast.success('Saved to your recipes');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the recipe.');
    } finally {
      setAdopting(false);
    }
  }

  /** Points the recipe at a different picture. The previous one stays in the gallery. */
  function setCoverImage(image: { url: string }) {
    if (!recipe) return;
    onUpdateRecipe(recipe.id, { image_url: image.url });
    toast.success('Recipe image updated');
  }
  const [showLangPicker, setShowLangPicker] = useState(false);
  const cachedTranslation = recipe && preferredLanguage
    ? translationsCache?.[`${recipe.id}:${preferredLanguage}`] ?? null
    : null;
  const [translation, setTranslation] = useState<RecipeTranslation | null>(cachedTranslation);

  // Names the saved PDF after the recipe, in whichever language is shown.
  usePrintTitle((typeof translation?.title === 'string' ? translation.title : null) || recipe?.title);
  /**
   * The language a translation is being made for, if any. While it is set the
   * recipe goes on showing what it showed before: the display language only
   * changes once a translation exists.
   */
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const translateRequest = useRef<AbortController | null>(null);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [planMeal, setPlanMeal] = useState<string>(DEFAULT_MEAL_TYPE);
  const [isAddingToPlan, setIsAddingToPlan] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [notesValue, setNotesValue] = useState(recipe?.notes || '');
  const [isRegeneratingTags, setIsRegeneratingTags] = useState(false);
  const [isRegeneratingNutrition, setIsRegeneratingNutrition] = useState(false);

  // Sync notes when a different recipe is opened
  useEffect(() => { setNotesValue(recipe?.notes || ''); }, [recipe?.id, recipe?.notes]);

  /**
   * Shows the stored translation for the recipe's display language.
   *
   * This never makes a translation. It used to: opening a recipe whose display
   * language had no stored translation started one by itself, on every open,
   * and locked the whole language picker until it came back. A recipe got into
   * that state whenever a translation failed or was deleted, because the
   * display language was saved *before* the translation existed. The result
   * was a recipe that spent an AI call each time it was opened and, while the
   * call ran, offered no way back to a language that worked.
   *
   * Now: a stored translation is shown; a display language with nothing behind
   * it is quietly put back to the original. Making a translation takes a
   * click (see handleTranslate).
   */
  useEffect(() => {
    if (!recipe || !preferredLanguage) { setTranslation(null); return; }
    const origLang = recipe.original_language ?? 'en';
    if (preferredLanguage === origLang) { setTranslation(null); return; }

    // In memory already: no flash of the original language.
    const cached = translationsCache?.[`${recipe.id}:${preferredLanguage}`];
    if (cached) { setTranslation(cached); return; }

    let cancelled = false;
    void supabase
      .from('recipe_translations')
      .select('*')
      .eq('recipe_id', recipe.id)
      .eq('language_code', preferredLanguage)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setTranslation(data as RecipeTranslation);
          onTranslationCached(recipe.id, preferredLanguage, data as RecipeTranslation);
        } else {
          setTranslation(null);
          // Only the owner can change the saved language; for anyone else the
          // original is simply what is shown.
          if (!isLinkedRecipe(recipe, userId)) onLanguageChange(null);
        }
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id, preferredLanguage]);

  // A translation still on its way when the drawer closes has nowhere to land.
  useEffect(() => () => { translateRequest.current?.abort(); }, []);

  const planDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      value: d.toISOString().split('T')[0],
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    };
  });
  const [planDate, setPlanDate] = useState(planDates[0].value);

  if (!recipe) return null;

  const baseServings = recipe.original_servings || recipe.servings || 1;
  const isScaled = scaledServings !== baseServings;
  const scale = scaledServings / baseServings;

  function changeServings(n: number) {
    setScaledServings(n);
    setAiIngredients(null); // math scaling until AI Scale is clicked again
  }

  async function handleAiScale() {
    if (!recipe) return;
    setIsAiScaling(true);
    try {
      const res = await apiFetch('/api/scale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: recipe.id,
          ingredients: parsed,
          currentServings: baseServings,
          targetServings: scaledServings,
        }),
      });
      if (!res.ok) throw new Error('Scale request failed');
      const data = await res.json() as { ingredients: { amount: string; name: string; details: string }[]; cached: boolean };
      setAiIngredients(data.ingredients);
      if (!data.cached) toast.success('AI rounded the quantities — looking good!');
    } catch {
      toast.error('AI scaling failed.');
    } finally {
      setIsAiScaling(false);
    }
  }

  async function handleSaveScaled() {
    if (!onSaveScaled || !recipe || !aiIngredients) return;
    setIsSavingScaled(true);
    try {
      // Explicitly omit DB-managed fields to prevent insert conflicts
      const { id: _id, created_at: _ca, tags: _tags, is_favourite: _fav, nutrition: _nut, rating: _r, notes: _n, user_id: _u, ...rest } = recipe;
      void _id; void _ca; void _tags; void _fav; void _nut; void _r; void _n; void _u;
      await onSaveScaled({
        ...rest,
        title: `${recipe.title} (${scaledServings} servings)`,
        ingredients: aiIngredients,
        servings: scaledServings,
        original_servings: scaledServings,
      });
      toast.success(`Saved as "${recipe.title} (${scaledServings} servings)"`);
    } catch {
      toast.error('Failed to save scaled recipe.');
    } finally {
      setIsSavingScaled(false);
    }
  }
  /**
   * Throws away one cached translation.
   *
   * If the reader is currently looking at that language there is nothing left
   * to render, so the recipe drops back to its original rather than sitting on
   * a translation that no longer exists.
   */
  async function handleRemoveTranslation(langCode: string, label: string) {
    if (!recipe) return;
    const wasShowing = preferredLanguage === langCode;
    const removed = await removeTranslation(langCode);
    if (!removed) {
      toast.error(`Could not delete the ${label} translation.`);
      return;
    }
    // The copy in memory goes too, or picking the language again would show
    // the translation that was just deleted instead of making a new one.
    onTranslationRemoved?.(recipe.id, langCode);
    if (wasShowing) {
      setTranslation(null);
      onLanguageChange(null);
    }
    toast.success(`${label} translation deleted. Choose the language again for a fresh one.`);
  }

  /** Stops a translation that is being made, if there is one. */
  function cancelPendingTranslation() {
    translateRequest.current?.abort();
    translateRequest.current = null;
    setPendingLanguage(null);
  }

  /**
   * A language chip was chosen.
   *
   * Every chip stays usable while a translation is being made, and choosing
   * any of them abandons it. There must always be a way back to a language
   * that works: translating can take a minute or more, and the picker used to
   * be disabled for the whole of it.
   */
  function handleTranslate(langCode: string) {
    if (!recipe) return;
    const origLang = recipe.original_language ?? 'en';
    cancelPendingTranslation();

    // The original, or the language already on screen: back to the original.
    if (langCode === origLang || preferredLanguage === langCode) {
      setTranslation(null);
      if (preferredLanguage) onLanguageChange(null);
      return;
    }

    // Already translated: switching is free and immediate.
    if (translationsCache?.[`${recipe.id}:${langCode}`] || cachedLanguages.includes(langCode)) {
      onLanguageChange(langCode);
      return;
    }

    // Needs making. The display language is saved only when it succeeds, so a
    // failed or abandoned translation leaves the recipe as it was.
    const request = new AbortController();
    translateRequest.current = request;
    setPendingLanguage(langCode);

    apiFetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: request.signal,
      body: JSON.stringify({
        recipeId: recipe.id,
        targetLanguage: langCode,
        title: recipe.title,
        description: recipe.description ?? '',
        instructions: recipe.instructions,
        ingredients: parseIngredients(recipe.ingredients),
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? 'Translation failed.');
        return data as RecipeTranslation & { cached: boolean; detectedSourceLanguage?: string };
      })
      .then((data) => {
        if (request.signal.aborted) return;
        onTranslationCached(recipe.id, langCode, data);
        // The picker's "already translated" ticks come from the table, so a
        // freshly created translation has to be picked up here too.
        refreshTranslations();
        onLanguageChange(langCode);
        if (!data.cached) toast.success('Recipe translated!');
        if (data.detectedSourceLanguage && !recipe.original_language) {
          onUpdateRecipe(recipe.id, { original_language: data.detectedSourceLanguage });
        }
      })
      .catch((err: unknown) => {
        if (request.signal.aborted) return;
        toast.error(err instanceof Error ? err.message : 'Translation failed.');
      })
      .finally(() => {
        if (translateRequest.current === request) {
          translateRequest.current = null;
          setPendingLanguage(null);
        }
      });
  }

  async function handleRegenerateTags() {
    if (!recipe) return;
    setIsRegeneratingTags(true);
    try {
      const res = await apiFetch('/api/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: recipe.id,
          title: recipe.title,
          description: recipe.description,
          ingredients: parseIngredients(recipe.ingredients),
          instructions: recipe.instructions,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { tags: string[] };
      onUpdateRecipe(recipe.id, { tags: data.tags });
      toast.success('Tags updated!');
    } catch {
      toast.error('Failed to regenerate tags.');
    } finally {
      setIsRegeneratingTags(false);
    }
  }

  async function handleRegenerateNutrition() {
    if (!recipe) return;
    setIsRegeneratingNutrition(true);
    try {
      const res = await apiFetch('/api/nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: recipe.id,
          title: recipe.title,
          ingredients: parseIngredients(recipe.ingredients),
          servings: recipe.servings,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { nutrition: Recipe['nutrition'] };
      onUpdateRecipe(recipe.id, { nutrition: data.nutrition });
      toast.success('Nutrition updated!');
    } catch {
      toast.error('Failed to regenerate nutrition.');
    } finally {
      setIsRegeneratingNutrition(false);
    }
  }

  const parsed = parseIngredients(recipe.ingredients);

  /**
   * Exactly what the ingredient table renders — scaled, AI-scaled or translated.
   * Derived once so the printed sheet cannot drift from the screen: printing a
   * recipe scaled to 6 servings must not hand back the original quantities.
   */
  const displayIngredients = parsed.map((ing, i) => {
    const aiIng = aiIngredients?.[i];
    const translatedIng = translation?.ingredients?.[i];
    const baseAmount = typeof translatedIng?.amount === 'string' ? translatedIng.amount : ing.amount;
    const rawDetails = typeof translatedIng?.details === 'string' ? translatedIng.details : ing.details;
    return {
      amount: aiIng ? aiIng.amount : (scaleAmount(baseAmount, scale) || ''),
      name: typeof translatedIng?.name === 'string' ? translatedIng.name : ing.name,
      details: rawDetails ? convertTemperaturesInText(rawDetails, temperatureUnit) : (rawDetails ?? ''),
    };
  });
  const rawInstructions = (typeof translation?.instructions === 'string' ? translation.instructions : recipe.instructions) ?? '';
  const displayInstructions = convertTemperaturesInText(rawInstructions, temperatureUnit) ?? '';
  const steps = displayInstructions.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const totalTime = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);

  async function handleAddToPlan() {
    if (!onAddMealPlan || !recipe) return;
    setIsAddingToPlan(true);
    try {
      await onAddMealPlan(planDate, planMeal, recipe.id);
      toast.success(`Added to ${planMeal} on ${planDates.find((d) => d.value === planDate)?.label}`);
      setShowAddPlan(false);
    } catch {
      toast.error('Failed to add to meal plan.');
    } finally {
      setIsAddingToPlan(false);
    }
  }

  function handleClose() {
    if (recipe && notesValue !== (recipe.notes || '')) {
      onUpdateRecipe(recipe.id, { notes: notesValue });
    }
    onClose();
  }

  return (
    <>
    {/* Only rendered to paper. Portalled to <body>, which is what lets the print
        rules hide the entire app with one selector. */}
    <RecipePrintSheet
      recipe={recipe}
      ingredients={displayIngredients}
      servings={scaledServings}
      title={typeof translation?.title === 'string' ? translation.title : undefined}
      description={typeof translation?.description === 'string' ? translation.description : undefined}
      instructions={displayInstructions}
    />

    <Dialog open={!!recipe} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[780px] overflow-hidden rounded-3xl bg-white dark:bg-card border-0 shadow-ambient p-0 w-[95vw] sm:w-full" style={{ boxShadow: '0 24px 80px rgba(47, 49, 46, 0.12)' }}>
        {/* Fixed close button — always visible, never scrolls away */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-20 p-2.5 rounded-full glass glass-dark text-white print:hidden"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="overflow-y-auto max-h-[var(--dialog-max-h)]">
        <div className="flex flex-col">
          <div className="w-full h-32 sm:h-44 md:h-64 overflow-hidden shrink-0 rounded-t-3xl relative">
            {recipe.image_url ? (
              <img src={recipe.image_url} className="w-full h-full object-cover" alt={recipe.title} />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-sk-primary-fixed via-sk-surface-low to-sk-surface-highest dark:from-primary/20 dark:via-muted dark:to-muted">
                <span className="text-[6rem] sm:text-[8rem] font-serif font-normal text-sk-primary/20 dark:text-primary/15 select-none leading-none">
                  {recipe.title?.[0]?.toUpperCase() ?? '?'}
                </span>
              </div>
            )}
          </div>
          <div className="p-4 sm:p-6 md:p-10 space-y-6 sm:space-y-8">
            <DialogHeader className="text-left space-y-2">
              <DialogTitle className="font-serif text-2xl sm:text-3xl md:text-[2.25rem] font-bold tracking-tight text-sk-on-surface dark:text-foreground leading-tight">
                {translation ? String(translation.title ?? recipe.title) : recipe.title}
              </DialogTitle>
              {/*
                Ordered by how often each is reached for, not by how many fit.
                Cooking is why a recipe gets opened, so it is the one labelled
                button; translate, meal plan and send are a tap away; everything
                rarer — and everything destructive — is behind the menu.

                This bar carried nine equal icons, with Cook, Delete and Print
                indistinguishable from one another.
              */}
              <div className="flex items-center gap-2 flex-wrap pt-1 print:hidden">
                <button
                  onClick={() => setIsCookMode(true)}
                  className="inline-flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-full bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground font-semibold font-sans text-sm transition-colors"
                >
                  <Flame className="w-4 h-4" /> Cook
                </button>

                <button
                  onClick={() => setShowLangPicker((v) => !v)}
                  className={`p-2.5 rounded-full transition-colors ${showLangPicker ? 'text-sk-primary bg-sk-primary-fixed/40 dark:bg-primary/20' : 'text-sk-outline hover:text-sk-primary hover:bg-sk-primary-fixed/30 dark:hover:bg-primary/15'}`}
                  title="Translate recipe"
                ><Languages className="w-4 h-4" /></button>

                {onAddMealPlan && (
                  <button
                    onClick={() => setShowAddPlan((v) => !v)}
                    className={`p-2.5 rounded-full transition-colors ${showAddPlan ? 'text-sk-primary bg-sk-primary-fixed/40 dark:bg-primary/20' : 'text-sk-outline hover:text-sk-primary hover:bg-sk-primary-fixed/30 dark:hover:bg-primary/15'}`}
                    title="Add to meal plan"
                  ><CalendarPlus className="w-4 h-4" /></button>
                )}

                {onSend && (
                  <button
                    onClick={() => onSend(recipe)}
                    className="p-2.5 rounded-full text-sk-outline hover:text-sk-primary hover:bg-sk-primary-fixed/30 dark:hover:bg-primary/15 transition-colors"
                    title="Send recipe to someone"
                  ><Send className="w-4 h-4" /></button>
                )}

                <div className="relative ml-auto">
                  <button
                    ref={moreButtonRef}
                    onClick={() => setShowMoreOptions((v) => !v)}
                    className={`p-2.5 rounded-full transition-colors ${showMoreOptions ? 'text-sk-on-surface-variant bg-sk-surface-low dark:bg-muted' : 'text-sk-outline hover:text-sk-on-surface-variant hover:bg-sk-surface-low dark:hover:bg-muted'}`}
                    title="More options"
                  ><MoreHorizontal className="w-4 h-4" /></button>
                  <AnchoredMenu
                    open={showMoreOptions}
                    onClose={() => setShowMoreOptions(false)}
                    anchorRef={moreButtonRef}
                    className="w-64 glass glass-menu rounded-2xl p-2 flex flex-col gap-0.5"
                  >
                      {recipe.source_url && (
                        <a
                          href={recipe.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setShowMoreOptions(false)}
                          className={MENU_ITEM}
                        >
                          <Globe className="w-3.5 h-3.5 shrink-0" /> View original
                        </a>
                      )}
                      {!recipe.source_url && recipe.image_url && (
                        <button
                          onClick={() => { document.getElementById('recipe-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setShowMoreOptions(false); }}
                          className={MENU_ITEM}
                        >
                          <ImageIcon className="w-3.5 h-3.5 shrink-0" /> View original photo
                        </button>
                      )}

                      {/* Owner-only from here: a linked account may read this
                          recipe but RLS refuses every write to it. */}
                      {!isLinked && (
                        <button
                          onClick={() => { onClose(); onEdit(recipe); }}
                          className={MENU_ITEM}
                        >
                          <Pencil className="w-3.5 h-3.5 shrink-0" /> Edit recipe
                        </button>
                      )}

                      <button onClick={() => { window.print(); setShowMoreOptions(false); }} className={MENU_ITEM}>
                        <Printer className="w-3.5 h-3.5 shrink-0" /> Print or save as PDF
                      </button>

                      {!isLinked && (
                        <>
                          <div className="h-px bg-sk-surface-container dark:bg-border my-1" />
                          {shareUrl ? (
                            <>
                              <button
                                onClick={() => { copyToClipboard(shareUrl, false); setShowMoreOptions(false); }}
                                className={MENU_ITEM}
                              >
                                <Share2 className="w-3.5 h-3.5 shrink-0" /> Copy public link
                              </button>
                              <button onClick={handleStopSharing} disabled={shareBusy} className={MENU_ITEM_DANGER}>
                                <Link2Off className="w-3.5 h-3.5 shrink-0" /> Stop sharing
                              </button>
                            </>
                          ) : (
                            <button onClick={handleCreateShareLink} disabled={shareBusy} className={MENU_ITEM}>
                              <Share2 className="w-3.5 h-3.5 shrink-0" /> Create public link
                            </button>
                          )}

                          <div className="h-px bg-sk-surface-container dark:bg-border my-1" />
                          <button
                            onClick={() => { handleRegenerateTags(); setShowMoreOptions(false); }}
                            disabled={isRegeneratingTags || isRegeneratingNutrition}
                            className={MENU_ITEM}
                          >
                            {isRegeneratingTags ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Tag className="w-3.5 h-3.5 shrink-0" />}
                            {isRegeneratingTags ? 'Regenerating…' : 'Regenerate tags'}
                          </button>
                          <button
                            onClick={() => { handleRegenerateNutrition(); setShowMoreOptions(false); }}
                            disabled={isRegeneratingTags || isRegeneratingNutrition}
                            className={MENU_ITEM}
                          >
                            {isRegeneratingNutrition ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Salad className="w-3.5 h-3.5 shrink-0" />}
                            {isRegeneratingNutrition ? 'Regenerating…' : 'Regenerate nutrition'}
                          </button>

                          {/* Deleting a translation lives here, not on the
                              language chips. It is only wanted when one came
                              out badly, which should be rare, and a cross on
                              every translated language made the picker look
                              like a list of things to remove. One entry per
                              stored translation, so a row that is never shown
                              (one stored for the original language) can still
                              be removed. */}
                          {cachedLanguages.map((code) => {
                            const label = LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();
                            return (
                              <button
                                key={code}
                                onClick={() => { handleRemoveTranslation(code, label); setShowMoreOptions(false); }}
                                disabled={removingLanguage !== null}
                                className={MENU_ITEM}
                              >
                                <Languages className="w-3.5 h-3.5 shrink-0" />
                                <span>{`Delete ${label} translation`}</span>
                              </button>
                            );
                          })}

                          {/* Last, and set apart: the one that cannot be undone. */}
                          <div className="h-px bg-sk-surface-container dark:bg-border my-1" />
                          <button
                            onClick={() => { onDelete(recipe); setShowMoreOptions(false); }}
                            className={MENU_ITEM_DANGER}
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete recipe
                          </button>
                        </>
                      )}
                  </AnchoredMenu>
                </div>
              </div>

              {/* Collections — always visible if any collections exist */}
              {collections && collections.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap py-0.5">
                  <FolderOpen className="w-3.5 h-3.5 text-sk-outline dark:text-muted-foreground shrink-0" />
                  {collections.map((c) => {
                    const inCollection = recipeCollectionIds?.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => inCollection ? onRemoveFromCollection?.(c.id) : onAddToCollection?.(c.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold font-sans transition-all ${
                          inCollection
                            ? 'bg-sk-primary text-white dark:bg-primary dark:text-primary-foreground shadow-sm'
                            : 'bg-sk-surface-low dark:bg-muted text-sk-on-surface-variant dark:text-muted-foreground hover:text-sk-primary dark:hover:text-primary hover:bg-sk-primary-fixed/30'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Language picker — shown when translate button is active */}
              {showLangPicker && (
                <div className="flex items-center gap-2 flex-wrap py-1">
                  {LANGUAGES.map((lang) => {
                    const isOriginal = (recipe.original_language ?? 'en') === lang.code;
                    const isActive = preferredLanguage === lang.code || (!preferredLanguage && isOriginal);
                    // Already in recipe_translations: opening it is free. The
                    // tick follows the stored row, not the label, so the
                    // original language carries one too when a row exists for
                    // it. Deleting one is in the options menu.
                    const isCached = cachedLanguages.includes(lang.code);
                    return (
                      <span
                        key={lang.code}
                        className={`inline-flex items-center rounded-full text-xs font-semibold font-sans transition-colors ${
                          isActive
                            ? 'bg-sk-primary text-white dark:bg-primary dark:text-primary-foreground'
                            : 'bg-sk-surface-low dark:bg-muted text-sk-on-surface-variant dark:text-muted-foreground'
                        } ${removingLanguage === lang.code ? 'opacity-50' : ''}`}
                      >
                        <button
                          onClick={() => handleTranslate(lang.code)}
                          disabled={removingLanguage === lang.code}
                          aria-busy={pendingLanguage === lang.code}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
                            isActive ? '' : 'hover:text-sk-primary dark:hover:text-primary'
                          } disabled:opacity-50 transition-colors`}
                          title={
                            isOriginal
                              ? 'Original language'
                              : pendingLanguage === lang.code
                                ? `Translating to ${lang.name}… choose any language to stop`
                                : isCached
                                  ? `${lang.name} — already translated, opens instantly`
                                  : `Translate to ${lang.name} (uses one AI call)`
                          }
                        >
                          <span>{lang.flag}</span>
                          <span>{lang.label}</span>
                          {isOriginal && <span className="opacity-60 text-[10px] ml-0.5">orig</span>}
                          {pendingLanguage === lang.code && (
                            <Loader2 className="w-3 h-3 ml-0.5 shrink-0 animate-spin" aria-label="Translating" />
                          )}
                          {isCached && (
                            <Check
                              className={`w-3 h-3 ml-0.5 shrink-0 ${isActive ? 'text-white/90 dark:text-primary-foreground/90' : 'text-sk-primary dark:text-primary'}`}
                              aria-label="Already translated"
                            />
                          )}
                        </button>
                      </span>
                    );
                  })}
                  {/* Where a faulty translation gets noticed is while reading
                      it, so the way to throw it away is offered here, and only
                      then. The options menu lists every stored translation,
                      including any that is never on screen. */}
                  {!isLinked && preferredLanguage && preferredLanguage !== (recipe.original_language ?? 'en') && cachedLanguages.includes(preferredLanguage) && (() => {
                    const shown = LANGUAGES.find((l) => l.code === preferredLanguage);
                    const name = shown?.name ?? preferredLanguage.toUpperCase();
                    return (
                      <button
                        onClick={() => handleRemoveTranslation(preferredLanguage, name)}
                        disabled={removingLanguage !== null}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-sans text-sk-outline dark:text-muted-foreground hover:text-destructive underline underline-offset-2 disabled:opacity-50 transition-colors"
                      >
                        Delete this translation
                      </button>
                    );
                  })()}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap pt-1">
                {recipe.servings && (
                  <div className="inline-flex items-center gap-2 bg-sk-primary-fixed/30 dark:bg-primary/15 rounded-full px-3 py-1.5">
                    <Users className="w-4 h-4 text-sk-primary dark:text-primary" />
                    <button
                      onClick={() => changeServings(Math.max(1, scaledServings - 1))}
                      aria-label="Decrease servings"
                      className="w-8 h-8 rounded-full bg-sk-primary-fixed/60 dark:bg-primary/25 text-sk-primary dark:text-primary hover:bg-sk-primary-fixed flex items-center justify-center font-bold transition-colors"
                    ><Minus className="w-3 h-3" /></button>
                    <span className="text-sm font-semibold font-sans text-sk-primary dark:text-primary min-w-[1.5rem] text-center">{scaledServings}</span>
                    <button
                      onClick={() => changeServings(scaledServings + 1)}
                      aria-label="Increase servings"
                      className="w-8 h-8 rounded-full bg-sk-primary-fixed/60 dark:bg-primary/25 text-sk-primary dark:text-primary hover:bg-sk-primary-fixed flex items-center justify-center font-bold transition-colors"
                    ><Plus className="w-3 h-3" /></button>
                    <span className="text-xs font-sans font-semibold text-sk-primary dark:text-primary ml-1">
                      {scaledServings === baseServings ? 'servings' : `servings (original: ${baseServings})`}
                    </span>
                  </div>
                )}
                {isScaled && !aiIngredients && (
                  <button
                    onClick={handleAiScale}
                    disabled={isAiScaling}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sk-secondary-container hover:bg-[#f0b48a] dark:bg-secondary dark:hover:bg-secondary/80 disabled:opacity-50 text-[#794e2e] dark:text-secondary-foreground text-xs font-bold font-sans rounded-full transition-colors"
                    title="Let AI round the quantities intelligently (no 1.5 eggs)"
                  >
                    {isAiScaling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {isAiScaling ? 'Scaling…' : 'AI Scale'}
                  </button>
                )}
                {aiIngredients && onSaveScaled && (
                  <button
                    onClick={handleSaveScaled}
                    disabled={isSavingScaled}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 disabled:opacity-50 text-white dark:text-primary-foreground text-xs font-bold font-sans rounded-full transition-colors"
                    title="Save as a new recipe with these AI-rounded quantities"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {isSavingScaled ? 'Saving…' : 'Save as new recipe'}
                  </button>
                )}
                {totalTime > 0 && (
                  <div className="inline-flex items-center gap-1.5 text-sm font-sans text-sk-on-surface-variant dark:text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    {recipe.prep_time_mins != null && recipe.prep_time_mins > 0 && (
                      <span>Prep {recipe.prep_time_mins}m</span>
                    )}
                    {recipe.prep_time_mins != null && recipe.prep_time_mins > 0 && recipe.cook_time_mins != null && recipe.cook_time_mins > 0 && (
                      <span className="text-sk-outline-variant">·</span>
                    )}
                    {recipe.cook_time_mins != null && recipe.cook_time_mins > 0 && (
                      <span>Cook {recipe.cook_time_mins}m</span>
                    )}
                  </div>
                )}
                <span className="text-sm font-sans text-sk-outline dark:text-muted-foreground">{parsed.length} ingredients</span>
                {(recipe.source_name || recipe.source_url) && (
                  recipe.source_url
                    ? <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-sans text-sk-outline hover:text-sk-primary dark:hover:text-primary transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                        {recipe.source_name || new URL(recipe.source_url).hostname.replace(/^www\./, '')}
                      </a>
                    : <span className="inline-flex items-center gap-1.5 text-sm font-sans text-sk-outline">
                        <ExternalLink className="w-3.5 h-3.5" />
                        {recipe.source_name}
                      </span>
                )}
              </div>

              {(translation ? translation.description : recipe.description) && (
                <DialogDescription className="font-serif text-base font-normal text-sk-on-surface-variant dark:text-muted-foreground leading-relaxed pt-1 italic">
                  {translation ? translation.description : recipe.description}
                </DialogDescription>
              )}

              {/* Add to plan form */}
              {showAddPlan && onAddMealPlan && (
                <div className="mt-2 p-4 bg-sk-primary-fixed/20 rounded-2xl space-y-3">
                  <p className="text-sm font-semibold font-sans text-sk-primary dark:text-primary flex items-center gap-1.5"><CalendarPlus className="w-4 h-4" /> Add to meal plan</p>
                  <div className="flex gap-2 flex-wrap">
                    <select
                      value={planDate}
                      onChange={(e) => setPlanDate(e.target.value)}
                      className="flex-1 min-w-[120px] text-sm font-sans rounded-xl border-0 bg-sk-surface-highest dark:bg-input text-sk-on-surface dark:text-foreground px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sk-primary/25"
                    >
                      {planDates.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                    <select
                      value={planMeal}
                      onChange={(e) => setPlanMeal(e.target.value)}
                      className="flex-1 min-w-[100px] text-sm font-sans rounded-xl border-0 bg-sk-surface-highest dark:bg-input text-sk-on-surface dark:text-foreground px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sk-primary/25"
                    >
                      {MEAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button
                      onClick={handleAddToPlan}
                      disabled={isAddingToPlan}
                      className="px-4 py-2 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground text-sm font-semibold font-sans rounded-full transition-colors disabled:opacity-50"
                    >
                      {isAddingToPlan ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-7 gap-8">
              <div className="md:col-span-3">
                <h3 className="font-sans text-xs font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground mb-4">
                  Ingredients
                </h3>
                {/* Ingredient list — no dividers, tonal background rows */}
                <div className="rounded-xl overflow-hidden bg-sk-surface-low dark:bg-muted">
                  <table className="w-full text-sm">
                    <tbody>
                      {displayIngredients.map((ing, i) => {
                        const displayAmount = ing.amount || '—';
                        const displayName = ing.name;
                        const displayDetails = ing.details;
                        return (
                          <tr key={i} className={i % 2 === 0 ? 'bg-sk-surface-low dark:bg-muted' : 'bg-white dark:bg-card/50'}>
                            <td className="py-2.5 px-4 font-semibold font-sans text-sk-primary dark:text-primary whitespace-nowrap w-1/3">
                              {displayAmount}
                            </td>
                            <td className="py-2.5 px-4 font-sans text-sk-on-surface dark:text-foreground">
                              {displayName}
                              {displayDetails ? <span className="text-sk-on-surface-variant dark:text-muted-foreground">, {displayDetails}</span> : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {recipe.nutrition && (() => {
                  const n = recipe.nutrition;
                  // Deliberately not multiplied by `scale`. These are
                  // per-serving figures — NUTRITION_TEMPLATE tells the model to
                  // "divide total recipe nutrients by the number of servings" —
                  // and a per-serving figure does not change with the size of
                  // the batch. Scaling them made a recipe taken from 4 servings
                  // to 8 report twice the calories *per serving*, under a
                  // heading that still read "Per serving".
                  const fmt = (v: number) => Math.round(v);
                  return (
                    <div className="mt-4">
                      <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground mb-2">
                        Per serving
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Calories', value: fmt(n.calories), unit: 'kcal' },
                          { label: 'Protein', value: fmt(n.protein_g), unit: 'g' },
                          { label: 'Carbs', value: fmt(n.carbs_g), unit: 'g' },
                          { label: 'Fat', value: fmt(n.fat_g), unit: 'g' },
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
                })()}
              </div>

              <div className="md:col-span-4">
                <h3 className="font-sans text-xs font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground mb-4">
                  Instructions
                </h3>
                {/* Steps — primary-fixed circle numbers, no bullet points */}
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
              </div>
            </div>

            {/* Tags */}
            <div className="pt-6">
              <div className="h-px bg-gradient-to-r from-transparent via-sk-outline-variant/20 to-transparent mb-6" />
              <div className="flex items-center gap-2 mb-3">
                <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground">Tags</span>
                <button
                  onClick={() => setShowTagEditor((v) => !v)}
                  className={`p-1 rounded-md transition-colors ${showTagEditor ? 'text-sk-primary bg-sk-primary-fixed/40 dark:bg-primary/20' : 'text-sk-outline hover:text-sk-primary hover:bg-sk-primary-fixed/30'}`}
                  title="Edit tags"
                ><Pencil className="w-3 h-3" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(recipe.tags || []).map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-sans bg-sk-primary-fixed/40 dark:bg-primary/15 text-sk-primary dark:text-primary">
                    {tag}
                    {showTagEditor && (
                      <button
                        onClick={() => onUpdateRecipe(recipe.id, { tags: recipe.tags.filter((t) => t !== tag) })}
                        aria-label={`Remove tag ${tag}`}
                        className="ml-0.5 hover:text-destructive transition-colors"
                      ><X className="w-2.5 h-2.5" /></button>
                    )}
                  </span>
                ))}
                {recipe.tags?.length === 0 && !showTagEditor && (
                  <span className="text-xs font-sans text-sk-outline dark:text-muted-foreground">No tags yet — use ⋯ to regenerate</span>
                )}
              </div>
              {showTagEditor && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {AVAILABLE_TAGS.filter((t) => !(recipe.tags || []).includes(t)).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => onUpdateRecipe(recipe.id, { tags: [...(recipe.tags || []), tag] })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-sans border border-dashed border-sk-outline-variant dark:border-border text-sk-outline dark:text-muted-foreground hover:border-sk-primary hover:text-sk-primary dark:hover:text-primary transition-colors"
                    >
                      <Plus className="w-2.5 h-2.5" />{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {isLinked && (
              <div className="mt-4 flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-sk-primary-fixed/30 dark:bg-primary/10">
                <p className="text-sm font-sans text-sk-on-surface dark:text-foreground flex-1 min-w-0">
                  This recipe belongs to someone you are connected with. Save a copy to edit it,
                  rate it or plan it.
                </p>
                <Button
                  onClick={handleAdopt}
                  disabled={adopting}
                  className="gap-1.5 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground border-0 shrink-0"
                >
                  <Plus className="w-4 h-4" /> {adopting ? 'Saving…' : 'Save to my recipes'}
                </Button>
              </div>
            )}

            {/* Photos */}
            <div id="recipe-gallery" className="pt-6">
              <div className="h-px bg-gradient-to-r from-transparent via-sk-outline-variant/20 to-transparent mb-6 -mt-2" />
              <RecipeGallery
                images={images}
                coverUrl={recipe.image_url || null}
                busy={galleryBusy}
                onAdd={addImages}
                onDelete={deleteImage}
                onSetCover={setCoverImage}
              />
            </div>

            {/* Rating & Notes */}
            <div className="pt-6 space-y-4">
              <div className="h-px bg-gradient-to-r from-transparent via-sk-outline-variant/20 to-transparent mb-6 -mt-2" />
              {/* Ratings are per person: yours is always editable, including on a
                  linked account's recipe, because it is stored against your own
                  user id rather than on the recipe row. */}
              <div className="flex items-center gap-3">
                <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground">Your Rating</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      disabled={ratingBusy}
                      onClick={() => setRating(myRating === star ? null : star)}
                      aria-label={myRating === star ? `Clear ${star} star rating` : `Rate ${star} star${star === 1 ? '' : 's'}`}
                      aria-pressed={star <= (myRating || 0)}
                      className="transition-transform hover:scale-125 disabled:opacity-50"
                    >
                      <Star className={`w-6 h-6 ${star <= (myRating || 0) ? 'fill-sk-primary text-sk-primary dark:fill-primary dark:text-primary' : 'text-sk-outline-variant dark:text-muted-foreground/40'}`} />
                    </button>
                  ))}
                </div>
                {myRating ? <span className="text-xs font-sans text-sk-outline dark:text-muted-foreground">Click again to remove</span> : null}
              </div>

              {otherRatings.map((r) => {
                const who = linkedPeople.find((p) => p.userId === r.user_id)?.label ?? 'Connected account';
                return (
                  <div key={r.user_id} className="flex items-center gap-3">
                    <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground">
                      {who}
                    </span>
                    <div className="flex gap-1" role="img" aria-label={`${who} rated this ${r.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-5 h-5 ${star <= r.rating ? 'fill-sk-primary/70 text-sk-primary/70 dark:fill-primary/70 dark:text-primary/70' : 'text-sk-outline-variant dark:text-muted-foreground/40'}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {(!isLinked || recipe.notes) && (
                <div className="space-y-1.5">
                  <label className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground">
                    {isLinked ? `${ownerLabel || 'Their'} notes` : 'Notes'}
                  </label>
                  {isLinked ? (
                    <p className="w-full rounded-xl bg-sk-surface-highest dark:bg-input text-sk-on-surface dark:text-foreground font-sans text-sm px-4 py-3 whitespace-pre-wrap">
                      {recipe.notes}
                    </p>
                  ) : (
                    <textarea
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      onBlur={() => onUpdateRecipe(recipe.id, { notes: notesValue })}
                      placeholder="e.g. Add more garlic next time, great with crusty bread..."
                      className="w-full rounded-xl border-0 bg-sk-surface-highest dark:bg-input text-sk-on-surface dark:text-foreground font-sans text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sk-primary/25 min-h-[70px] resize-none placeholder:text-sk-outline dark:placeholder:text-muted-foreground"
                    />
                  )}
                  {!isLinked && (
                    <p className="text-[11px] font-sans text-sk-outline dark:text-muted-foreground">{noteAudience}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        </div>{/* end overflow-y-auto */}
        {nestedDialogs}
      </DialogContent>

    </Dialog>

    <CookMode
      recipe={recipe}
      isOpen={isCookMode}
      onClose={() => setIsCookMode(false)}
      translation={translation}
    />
    </>
  );
}
