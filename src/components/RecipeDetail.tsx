import { useState, useEffect } from 'react';
import { Users, Minus, Plus, Star, Share2, Printer, Flame, Pencil, Trash2, Clock, CalendarPlus, ExternalLink, Copy, Globe, ImageIcon, X, Sparkles, Loader2, Languages, Send, MoreHorizontal, Tag, Salad, FolderPlus, FolderMinus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parseIngredients, scaleAmount } from '@/lib/recipeUtils';
import { convertTemperaturesInText } from '@/lib/temperatureUtils';
import { MEAL_TYPES, LANGUAGES, AVAILABLE_TAGS } from '@/lib/constants';
import type { Recipe, RecipeTranslation, Collection } from '@/types';
import { CookMode } from '@/components/CookMode';

interface Props {
  recipe: Recipe | null;
  preferredLanguage: string | null;
  temperatureUnit?: 'C' | 'F';
  translationsCache?: Record<string, RecipeTranslation>;
  onLanguageChange: (lang: string | null) => void;
  onTranslationCached: (recipeId: string, langCode: string, t: RecipeTranslation) => void;
  onClose: () => void;
  onEdit: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
  onSend?: (r: Recipe) => void;
  onUpdateRecipe: (id: string, changes: Partial<Recipe>) => void;
  onAddMealPlan?: (date: string, mealType: string, recipeId: string) => Promise<void>;
  onSaveScaled?: (payload: Omit<Recipe, 'id' | 'created_at' | 'tags' | 'is_favourite' | 'nutrition' | 'rating' | 'notes' | 'user_id'>) => Promise<void>;
  collections?: Collection[];
  recipeCollectionIds?: string[];
  onAddToCollection?: (collectionId: string) => Promise<void>;
  onRemoveFromCollection?: (collectionId: string) => Promise<void>;
}

export function RecipeDetail({ recipe, preferredLanguage, temperatureUnit = 'C', translationsCache, onLanguageChange, onTranslationCached, onClose, onEdit, onDelete, onSend, onUpdateRecipe, onAddMealPlan, onSaveScaled, collections, recipeCollectionIds, onAddToCollection, onRemoveFromCollection }: Props) {
  const baseServings0 = recipe?.original_servings || recipe?.servings || 1;
  const [scaledServings, setScaledServings] = useState(baseServings0);
  const [aiIngredients, setAiIngredients] = useState<{ amount: string; name: string; details: string }[] | null>(null);
  const [isAiScaling, setIsAiScaling] = useState(false);
  const [isSavingScaled, setIsSavingScaled] = useState(false);
  const [isCookMode, setIsCookMode] = useState(false);
  const [showPhotoLightbox, setShowPhotoLightbox] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const cachedTranslation = recipe && preferredLanguage
    ? translationsCache?.[`${recipe.id}:${preferredLanguage}`] ?? null
    : null;
  const [translation, setTranslation] = useState<RecipeTranslation | null>(cachedTranslation);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [planMeal, setPlanMeal] = useState<string>(MEAL_TYPES[2]);
  const [isAddingToPlan, setIsAddingToPlan] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [notesValue, setNotesValue] = useState(recipe?.notes || '');
  const [isRegeneratingTags, setIsRegeneratingTags] = useState(false);
  const [isRegeneratingNutrition, setIsRegeneratingNutrition] = useState(false);

  // Sync notes when a different recipe is opened
  useEffect(() => { setNotesValue(recipe?.notes || ''); }, [recipe?.id, recipe?.notes]);

  // Auto-translate when recipe opens or preferred language changes
  useEffect(() => {
    if (!recipe || !preferredLanguage) { setTranslation(null); return; }
    const origLang = recipe.original_language ?? 'en';
    if (preferredLanguage === origLang) { setTranslation(null); return; }

    // Use cached translation immediately if available — avoids flash of original language
    const cached = translationsCache?.[`${recipe.id}:${preferredLanguage}`];
    if (cached) { setTranslation(cached); return; }

    let cancelled = false;
    setIsTranslating(true);
    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipeId: recipe.id,
        targetLanguage: preferredLanguage,
        title: recipe.title,
        description: recipe.description ?? '',
        instructions: recipe.instructions,
        ingredients: parseIngredients(recipe.ingredients),
      }),
    })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data: RecipeTranslation & { cached: boolean; detectedSourceLanguage?: string }) => {
        if (cancelled) return;
        setTranslation(data);
        onTranslationCached(recipe.id, preferredLanguage, data);
        if (!data.cached) toast.success('Recipe translated!');
        if (data.detectedSourceLanguage && !recipe.original_language) {
          onUpdateRecipe(recipe.id, { original_language: data.detectedSourceLanguage });
        }
      })
      .catch(() => { if (!cancelled) toast.error('Translation failed.'); })
      .finally(() => { if (!cancelled) setIsTranslating(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id, preferredLanguage]);

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
      const res = await fetch('/api/scale', {
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
  function handleTranslate(langCode: string) {
    if (!recipe) return;
    const origLang = recipe.original_language ?? 'en';
    // Clicking active language or original → restore original
    if (preferredLanguage === langCode || langCode === origLang) {
      onLanguageChange(null);
      setTranslation(null);
      return;
    }
    onLanguageChange(langCode);
    // The useEffect above will fire and fetch the translation
  }

  async function handleRegenerateTags() {
    if (!recipe) return;
    setIsRegeneratingTags(true);
    try {
      const res = await fetch('/api/tag', {
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
      const res = await fetch('/api/nutrition', {
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
    <Dialog open={!!recipe} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[780px] overflow-hidden rounded-3xl bg-white dark:bg-card border-0 shadow-ambient p-0 w-[95vw] sm:w-full" style={{ boxShadow: '0 24px 80px rgba(47, 49, 46, 0.12)' }}>
        {/* Fixed close button — always visible, never scrolls away */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white transition-colors shadow-md ring-1 ring-white/20 print:hidden"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="overflow-y-auto max-h-[92vh]">
        <div className="flex flex-col">
          {recipe.image_url && (
            <div className="w-full h-48 sm:h-60 md:h-80 overflow-hidden shrink-0 rounded-t-3xl">
              <img src={recipe.image_url} className="w-full h-full object-cover" alt={recipe.title} />
            </div>
          )}
          <div className="p-4 sm:p-6 md:p-10 space-y-6 sm:space-y-8">
            <DialogHeader className="text-left space-y-2">
              <DialogTitle className="font-serif text-2xl sm:text-3xl md:text-[2.25rem] font-normal tracking-tight text-sk-on-surface dark:text-foreground leading-tight">
                {translation ? String(translation.title ?? recipe.title) : recipe.title}
              </DialogTitle>
              <div className="flex items-center gap-1 flex-wrap pt-1 print:hidden">
                {recipe.source_url && (
                  <a
                    href={recipe.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-full text-sk-outline hover:text-sk-primary hover:bg-sk-primary-fixed/30 dark:hover:bg-primary/15 transition-colors"
                    title={`View original: ${recipe.source_name || recipe.source_url}`}
                  ><Globe className="w-4 h-4" /></a>
                )}
                {!recipe.source_url && recipe.image_url && (
                  <button
                    onClick={() => setShowPhotoLightbox(true)}
                    className="p-2 rounded-full text-sk-outline hover:text-sk-primary hover:bg-sk-primary-fixed/30 dark:hover:bg-primary/15 transition-colors"
                    title="View original photo"
                  ><ImageIcon className="w-4 h-4" /></button>
                )}
                {onSend && (
                  <button
                    onClick={() => onSend(recipe)}
                    className="p-2 rounded-full text-sk-outline hover:text-sk-primary hover:bg-sk-primary-fixed/30 dark:hover:bg-primary/15 transition-colors"
                    title="Send recipe to someone"
                  ><Send className="w-4 h-4" /></button>
                )}
                {onAddMealPlan && (
                  <button
                    onClick={() => setShowAddPlan((v) => !v)}
                    className={`p-2 rounded-full transition-colors ${showAddPlan ? 'text-sk-primary bg-sk-primary-fixed/40 dark:bg-primary/20' : 'text-sk-outline hover:text-sk-primary hover:bg-sk-primary-fixed/30 dark:hover:bg-primary/15'}`}
                    title="Add to meal plan"
                  ><CalendarPlus className="w-4 h-4" /></button>
                )}
                <div className="w-px h-5 bg-sk-outline-variant/30 dark:bg-border mx-0.5" />
                <button
                  onClick={() => setShowLangPicker((v) => !v)}
                  className={`p-2 rounded-full transition-colors ${showLangPicker ? 'text-sk-primary bg-sk-primary-fixed/40 dark:bg-primary/20' : 'text-sk-outline hover:text-sk-primary hover:bg-sk-primary-fixed/30 dark:hover:bg-primary/15'}`}
                  title="Translate recipe"
                ><Languages className="w-4 h-4" /></button>
                <div className="w-px h-5 bg-sk-outline-variant/30 dark:bg-border mx-0.5" />
                <button
                  onClick={() => setIsCookMode(true)}
                  className="p-2 rounded-full text-sk-outline hover:text-sk-secondary dark:hover:text-secondary-foreground hover:bg-sk-secondary-container/30 dark:hover:bg-secondary/20 transition-colors"
                  title="Cook Mode"
                ><Flame className="w-4 h-4" /></button>
                <button
                  onClick={() => { onClose(); onEdit(recipe); }}
                  className="p-2 rounded-full text-sk-outline hover:text-sk-primary hover:bg-sk-primary-fixed/30 dark:hover:bg-primary/15 transition-colors"
                  title="Edit recipe"
                ><Pencil className="w-4 h-4" /></button>
                <button
                  onClick={() => onDelete(recipe)}
                  className="p-2 rounded-full text-sk-outline hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Delete recipe"
                ><Trash2 className="w-4 h-4" /></button>
                <button
                  onClick={() => window.print()}
                  className="p-2 rounded-full text-sk-outline hover:text-sk-on-surface-variant hover:bg-sk-surface-low dark:hover:bg-muted transition-colors print:hidden"
                  title="Print recipe"
                ><Printer className="w-4 h-4" /></button>
                <div className="w-px h-5 bg-sk-outline-variant/30 dark:bg-border mx-0.5" />
                <div className="relative">
                  <button
                    onClick={() => setShowMoreOptions((v) => !v)}
                    className={`p-2 rounded-full transition-colors ${showMoreOptions ? 'text-sk-on-surface-variant bg-sk-surface-low dark:bg-muted' : 'text-sk-outline hover:text-sk-on-surface-variant hover:bg-sk-surface-low dark:hover:bg-muted'}`}
                    title="More options"
                  ><MoreHorizontal className="w-4 h-4" /></button>
                  {showMoreOptions && (
                    <div className="absolute right-0 top-full mt-1 z-30 w-52 max-h-[60vh] overflow-y-auto bg-white dark:bg-card rounded-2xl shadow-ambient p-2 flex flex-col gap-0.5" style={{ boxShadow: '0 12px 40px rgba(47,49,46,0.10)' }}>
                      <button
                        onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/recipe/${recipe.id}`); toast.success('Link copied!'); setShowMoreOptions(false); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium font-sans text-sk-on-surface-variant dark:text-muted-foreground hover:bg-sk-surface-low dark:hover:bg-muted hover:text-sk-primary dark:hover:text-primary transition-colors text-left"
                      >
                        <Share2 className="w-3.5 h-3.5 shrink-0" /> Copy share link
                      </button>
                      <div className="h-px bg-sk-surface-container dark:bg-border my-1" />
                      <button
                        onClick={() => { handleRegenerateTags(); setShowMoreOptions(false); }}
                        disabled={isRegeneratingTags || isRegeneratingNutrition}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium font-sans text-sk-on-surface-variant dark:text-muted-foreground hover:bg-sk-surface-low dark:hover:bg-muted hover:text-sk-primary dark:hover:text-primary transition-colors text-left disabled:opacity-50"
                      >
                        {isRegeneratingTags ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Tag className="w-3.5 h-3.5 shrink-0" />}
                        {isRegeneratingTags ? 'Regenerating…' : 'Regenerate tags'}
                      </button>
                      <button
                        onClick={() => { handleRegenerateNutrition(); setShowMoreOptions(false); }}
                        disabled={isRegeneratingTags || isRegeneratingNutrition}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium font-sans text-sk-on-surface-variant dark:text-muted-foreground hover:bg-sk-surface-low dark:hover:bg-muted hover:text-sk-primary dark:hover:text-primary transition-colors text-left disabled:opacity-50"
                      >
                        {isRegeneratingNutrition ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Salad className="w-3.5 h-3.5 shrink-0" />}
                        {isRegeneratingNutrition ? 'Regenerating…' : 'Regenerate nutrition'}
                      </button>
                      {collections && collections.length > 0 && onAddToCollection && onRemoveFromCollection && (
                        <>
                          <div className="h-px bg-sk-surface-container dark:bg-border my-1" />
                          {collections.map((c) => {
                            const inCollection = recipeCollectionIds?.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                onClick={() => { if (inCollection) onRemoveFromCollection(c.id); else onAddToCollection(c.id); setShowMoreOptions(false); }}
                                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium font-sans text-sk-on-surface-variant dark:text-muted-foreground hover:bg-sk-surface-low dark:hover:bg-muted hover:text-sk-primary dark:hover:text-primary transition-colors text-left"
                              >
                                {inCollection ? <FolderMinus className="w-3.5 h-3.5 shrink-0 text-sk-primary dark:text-primary" /> : <FolderPlus className="w-3.5 h-3.5 shrink-0 text-sk-outline" />}
                                {inCollection ? `Remove from ${c.name}` : `Add to ${c.name}`}
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Language picker — shown when translate button is active */}
              {showLangPicker && (
                <div className="flex items-center gap-2 flex-wrap py-1">
                  {LANGUAGES.map((lang) => {
                    const isOriginal = (recipe.original_language ?? 'en') === lang.code;
                    const isActive = preferredLanguage === lang.code || (!preferredLanguage && isOriginal);
                    return (
                      <button
                        key={lang.code}
                        onClick={() => handleTranslate(lang.code)}
                        disabled={isTranslating}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold font-sans transition-colors ${
                          isActive
                            ? 'bg-sk-primary text-white dark:bg-primary dark:text-primary-foreground'
                            : 'bg-sk-surface-low dark:bg-muted text-sk-on-surface-variant dark:text-muted-foreground hover:text-sk-primary dark:hover:text-primary hover:bg-sk-primary-fixed/40'
                        } disabled:opacity-50`}
                        title={isOriginal ? 'Original language' : `Translate to ${lang.label}`}
                      >
                        <span>{lang.flag}</span>
                        <span>{lang.label}</span>
                        {isOriginal && <span className="opacity-60 text-[10px] ml-0.5">orig</span>}
                      </button>
                    );
                  })}
                  {isTranslating && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap pt-1">
                {recipe.servings && (
                  <div className="inline-flex items-center gap-2 bg-sk-primary-fixed/30 dark:bg-primary/15 rounded-full px-3 py-1.5">
                    <Users className="w-4 h-4 text-sk-primary dark:text-primary" />
                    <button
                      onClick={() => changeServings(Math.max(1, scaledServings - 1))}
                      className="w-6 h-6 rounded-full bg-sk-primary-fixed/60 dark:bg-primary/25 text-sk-primary dark:text-primary hover:bg-sk-primary-fixed flex items-center justify-center font-bold transition-colors"
                    ><Minus className="w-3 h-3" /></button>
                    <span className="text-sm font-semibold font-sans text-sk-primary dark:text-primary min-w-[1.5rem] text-center">{scaledServings}</span>
                    <button
                      onClick={() => changeServings(scaledServings + 1)}
                      className="w-6 h-6 rounded-full bg-sk-primary-fixed/60 dark:bg-primary/25 text-sk-primary dark:text-primary hover:bg-sk-primary-fixed flex items-center justify-center font-bold transition-colors"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 disabled:opacity-50 text-white text-xs font-bold font-sans rounded-full transition-colors"
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
                      className="px-4 py-2 bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white text-sm font-semibold font-sans rounded-full transition-colors disabled:opacity-50"
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
                      {parsed.map((ing, i) => {
                        const aiIng = aiIngredients?.[i];
                        const translatedIng = translation?.ingredients?.[i];
                        const baseAmount = typeof translatedIng?.amount === 'string' ? translatedIng.amount : ing.amount;
                        const displayAmount = aiIng ? aiIng.amount : (scaleAmount(baseAmount, scale) || '—');
                        const displayName = typeof translatedIng?.name === 'string' ? translatedIng.name : ing.name;
                        const rawDetails = typeof translatedIng?.details === 'string' ? translatedIng.details : ing.details;
                        const displayDetails = rawDetails ? convertTemperaturesInText(rawDetails, temperatureUnit) : rawDetails;
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
                  const fmt = (v: number) => Math.round(v * scale);
                  return (
                    <div className="mt-4">
                      <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground mb-2">
                        Per serving {scale !== 1 ? `(scaled ×${scale.toFixed(2)})` : ''}
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

            {/* Rating & Notes */}
            <div className="pt-6 space-y-4">
              <div className="h-px bg-gradient-to-r from-transparent via-sk-outline-variant/20 to-transparent mb-6 -mt-2" />
              <div className="flex items-center gap-3">
                <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground">Your Rating</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => {
                        const newRating = recipe.rating === star ? null : star;
                        onUpdateRecipe(recipe.id, { rating: newRating });
                      }}
                      className="transition-transform hover:scale-125"
                    >
                      <Star className={`w-6 h-6 ${star <= (recipe.rating || 0) ? 'fill-sk-primary text-sk-primary dark:fill-primary dark:text-primary' : 'text-sk-outline-variant dark:text-muted-foreground/40'}`} />
                    </button>
                  ))}
                </div>
                {recipe.rating && <span className="text-xs font-sans text-sk-outline dark:text-muted-foreground">Click again to remove</span>}
              </div>
              <div className="space-y-1.5">
                <label className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground">Personal Notes</label>
                <textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  onBlur={() => onUpdateRecipe(recipe.id, { notes: notesValue })}
                  placeholder="e.g. Add more garlic next time, great with crusty bread..."
                  className="w-full rounded-xl border-0 bg-sk-surface-highest dark:bg-input text-sk-on-surface dark:text-foreground font-sans text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sk-primary/25 min-h-[70px] resize-none placeholder:text-sk-outline dark:placeholder:text-muted-foreground"
                />
              </div>
            </div>
          </div>
        </div>
        </div>{/* end overflow-y-auto */}
      </DialogContent>

      {/* Photo lightbox — full-screen overlay for photo-extracted recipes */}
      {showPhotoLightbox && recipe.image_url && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => setShowPhotoLightbox(false)}
        >
          <button
            onClick={() => setShowPhotoLightbox(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={recipe.image_url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-full transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open full size
          </a>
        </div>
      )}
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
