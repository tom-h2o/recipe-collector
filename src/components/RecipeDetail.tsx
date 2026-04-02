import { useState, useEffect } from 'react';
import { ChefHat, Users, Minus, Plus, Star, Share2, Printer, Flame, Pencil, Trash2, Clock, CalendarPlus, ExternalLink, Copy, Globe, ImageIcon, X, Sparkles, Loader2, Languages, Send, MoreHorizontal, Tag, Salad, FolderPlus, FolderMinus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parseIngredients, scaleAmount } from '@/lib/recipeUtils';
import { convertTemperaturesInText } from '@/lib/temperatureUtils';
import { MEAL_TYPES, LANGUAGES, AVAILABLE_TAGS } from '@/lib/constants';
import type { Recipe, RecipeTranslation, Collection } from '@/types';

interface Props {
  recipe: Recipe | null;
  preferredLanguage: string | null;
  temperatureUnit?: 'C' | 'F';
  onLanguageChange: (lang: string | null) => void;
  onTranslationCached: (recipeId: string, langCode: string, t: RecipeTranslation) => void;
  onClose: () => void;
  onEdit: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
  onCook: () => void;
  onSend?: (r: Recipe) => void;
  onUpdateRecipe: (id: string, changes: Partial<Recipe>) => void;
  onAddMealPlan?: (date: string, mealType: string, recipeId: string) => Promise<void>;
  onSaveScaled?: (payload: Omit<Recipe, 'id' | 'created_at' | 'tags' | 'is_favourite' | 'nutrition' | 'rating' | 'notes' | 'user_id'>) => Promise<void>;
  collections?: Collection[];
  recipeCollectionIds?: string[];
  onAddToCollection?: (collectionId: string) => Promise<void>;
  onRemoveFromCollection?: (collectionId: string) => Promise<void>;
}

export function RecipeDetail({ recipe, preferredLanguage, temperatureUnit = 'C', onLanguageChange, onTranslationCached, onClose, onEdit, onDelete, onCook, onSend, onUpdateRecipe, onAddMealPlan, onSaveScaled, collections, recipeCollectionIds, onAddToCollection, onRemoveFromCollection }: Props) {
  const baseServings0 = recipe?.original_servings || recipe?.servings || 1;
  const [scaledServings, setScaledServings] = useState(baseServings0);
  const [aiIngredients, setAiIngredients] = useState<{ amount: string; name: string; details: string }[] | null>(null);
  const [isAiScaling, setIsAiScaling] = useState(false);
  const [isSavingScaled, setIsSavingScaled] = useState(false);
  const [showPhotoLightbox, setShowPhotoLightbox] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [translation, setTranslation] = useState<RecipeTranslation | null>(null);
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
  const rawInstructions = translation ? translation.instructions : recipe.instructions;
  const displayInstructions = convertTemperaturesInText(rawInstructions, temperatureUnit);
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
    <Dialog open={!!recipe} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[780px] overflow-hidden rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-0 w-[95vw] sm:w-full">
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
              <DialogTitle className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
                {translation ? translation.title : recipe.title}
              </DialogTitle>
              <div className="flex items-center gap-1 flex-wrap pt-1 print:hidden">
                {recipe.source_url && (
                  <a
                    href={recipe.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-full text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    title={`View original: ${recipe.source_name || recipe.source_url}`}
                  ><Globe className="w-4 h-4" /></a>
                )}
                {!recipe.source_url && recipe.image_url && (
                  <button
                    onClick={() => setShowPhotoLightbox(true)}
                    className="p-2 rounded-full text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    title="View original photo"
                  ><ImageIcon className="w-4 h-4" /></button>
                )}
                {onSend && (
                  <button
                    onClick={() => onSend(recipe)}
                    className="p-2 rounded-full text-zinc-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                    title="Send recipe to someone"
                  ><Send className="w-4 h-4" /></button>
                )}
                {onAddMealPlan && (
                  <button
                    onClick={() => setShowAddPlan((v) => !v)}
                    className={`p-2 rounded-full transition-colors ${showAddPlan ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                    title="Add to meal plan"
                  ><CalendarPlus className="w-4 h-4" /></button>
                )}
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-0.5" />
                <button
                  onClick={() => setShowLangPicker((v) => !v)}
                  className={`p-2 rounded-full transition-colors ${showLangPicker ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                  title="Translate recipe"
                ><Languages className="w-4 h-4" /></button>
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-0.5" />
                <button
                  onClick={onCook}
                  className="p-2 rounded-full text-zinc-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                  title="Cook Mode"
                ><Flame className="w-4 h-4" /></button>
                <button
                  onClick={() => { onClose(); onEdit(recipe); }}
                  className="p-2 rounded-full text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  title="Edit recipe"
                ><Pencil className="w-4 h-4" /></button>
                <button
                  onClick={() => onDelete(recipe)}
                  className="p-2 rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Delete recipe"
                ><Trash2 className="w-4 h-4" /></button>
                <button
                  onClick={() => window.print()}
                  className="p-2 rounded-full text-zinc-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors print:hidden"
                  title="Print recipe"
                ><Printer className="w-4 h-4" /></button>
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-0.5" />
                <div className="relative">
                  <button
                    onClick={() => setShowMoreOptions((v) => !v)}
                    className={`p-2 rounded-full transition-colors ${showMoreOptions ? 'text-zinc-600 bg-zinc-100 dark:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="More options"
                  ><MoreHorizontal className="w-4 h-4" /></button>
                  {showMoreOptions && (
                    <div className="absolute right-0 top-full mt-1 z-30 w-52 max-h-[60vh] overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl p-2 flex flex-col gap-0.5">
                      <button
                        onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/recipe/${recipe.id}`); toast.success('Link copied!'); setShowMoreOptions(false); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                      >
                        <Share2 className="w-3.5 h-3.5 shrink-0" /> Copy share link
                      </button>
                      <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
                      <button
                        onClick={() => { handleRegenerateTags(); setShowMoreOptions(false); }}
                        disabled={isRegeneratingTags || isRegeneratingNutrition}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left disabled:opacity-50"
                      >
                        {isRegeneratingTags ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Tag className="w-3.5 h-3.5 shrink-0" />}
                        {isRegeneratingTags ? 'Regenerating…' : 'Regenerate tags'}
                      </button>
                      <button
                        onClick={() => { handleRegenerateNutrition(); setShowMoreOptions(false); }}
                        disabled={isRegeneratingTags || isRegeneratingNutrition}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left disabled:opacity-50"
                      >
                        {isRegeneratingNutrition ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Salad className="w-3.5 h-3.5 shrink-0" />}
                        {isRegeneratingNutrition ? 'Regenerating…' : 'Regenerate nutrition'}
                      </button>
                      {collections && collections.length > 0 && onAddToCollection && onRemoveFromCollection && (
                        <>
                          <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
                          {collections.map((c) => {
                            const inCollection = recipeCollectionIds?.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                onClick={() => { if (inCollection) onRemoveFromCollection(c.id); else onAddToCollection(c.id); setShowMoreOptions(false); }}
                                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                              >
                                {inCollection ? <FolderMinus className="w-3.5 h-3.5 shrink-0 text-indigo-400" /> : <FolderPlus className="w-3.5 h-3.5 shrink-0 text-zinc-400" />}
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
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                          isActive
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-blue-400 hover:text-blue-500'
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

              <div className="flex items-center gap-4 flex-wrap pt-1">
                {recipe.servings && (
                  <div className="inline-flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-full px-3 py-1.5">
                    <Users className="w-4 h-4 text-orange-500" />
                    <button
                      onClick={() => changeServings(Math.max(1, scaledServings - 1))}
                      className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 hover:bg-orange-200 flex items-center justify-center font-bold transition-colors"
                    ><Minus className="w-3 h-3" /></button>
                    <span className="text-sm font-bold text-orange-600 dark:text-orange-400 min-w-[1.5rem] text-center">{scaledServings}</span>
                    <button
                      onClick={() => changeServings(scaledServings + 1)}
                      className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 hover:bg-orange-200 flex items-center justify-center font-bold transition-colors"
                    ><Plus className="w-3 h-3" /></button>
                    <span className="text-xs font-semibold text-orange-500 ml-1">
                      {scaledServings === baseServings ? 'servings' : `servings (original: ${baseServings})`}
                    </span>
                  </div>
                )}
                {isScaled && !aiIngredients && (
                  <button
                    onClick={handleAiScale}
                    disabled={isAiScaling}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-xs font-bold rounded-full transition-colors"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold rounded-full transition-colors"
                    title="Save as a new recipe with these AI-rounded quantities"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {isSavingScaled ? 'Saving…' : 'Save as new recipe'}
                  </button>
                )}
                {totalTime > 0 && (
                  <div className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                    <Clock className="w-4 h-4" />
                    {recipe.prep_time_mins != null && recipe.prep_time_mins > 0 && (
                      <span>Prep {recipe.prep_time_mins}m</span>
                    )}
                    {recipe.prep_time_mins != null && recipe.prep_time_mins > 0 && recipe.cook_time_mins != null && recipe.cook_time_mins > 0 && (
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                    )}
                    {recipe.cook_time_mins != null && recipe.cook_time_mins > 0 && (
                      <span>Cook {recipe.cook_time_mins}m</span>
                    )}
                  </div>
                )}
                <span className="text-sm text-zinc-400 font-medium">{parsed.length} ingredients</span>
                {(recipe.source_name || recipe.source_url) && (
                  recipe.source_url
                    ? <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-orange-500 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                        {recipe.source_name || new URL(recipe.source_url).hostname.replace(/^www\./, '')}
                      </a>
                    : <span className="inline-flex items-center gap-1.5 text-sm text-zinc-400">
                        <ExternalLink className="w-3.5 h-3.5" />
                        {recipe.source_name}
                      </span>
                )}
              </div>

              {(translation ? translation.description : recipe.description) && (
                <DialogDescription className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed pt-1">
                  {translation ? translation.description : recipe.description}
                </DialogDescription>
              )}

              {/* Add to plan form */}
              {showAddPlan && onAddMealPlan && (
                <div className="mt-2 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-2xl space-y-3">
                  <p className="text-sm font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5"><CalendarPlus className="w-4 h-4" /> Add to meal plan</p>
                  <div className="flex gap-2 flex-wrap">
                    <select
                      value={planDate}
                      onChange={(e) => setPlanDate(e.target.value)}
                      className="flex-1 min-w-[120px] text-sm rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400/60"
                    >
                      {planDates.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                    <select
                      value={planMeal}
                      onChange={(e) => setPlanMeal(e.target.value)}
                      className="flex-1 min-w-[100px] text-sm rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400/60"
                    >
                      {MEAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button
                      onClick={handleAddToPlan}
                      disabled={isAddingToPlan}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                    >
                      {isAddingToPlan ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
              <div className="md:col-span-2">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-orange-500" /> Ingredients
                </h3>
                <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {parsed.map((ing, i) => {
                        const aiIng = aiIngredients?.[i];
                        const translatedIng = translation?.ingredients?.[i];
                        const displayAmount = aiIng ? aiIng.amount : (scaleAmount(ing.amount, scale) || '—');
                        const displayName = translatedIng ? translatedIng.name : ing.name;
                        const rawDetails = translatedIng ? translatedIng.details : ing.details;
                        const displayDetails = rawDetails ? convertTemperaturesInText(rawDetails, temperatureUnit) : rawDetails;
                        return (
                        <tr key={i} className={`${i % 2 === 0 ? 'bg-zinc-50 dark:bg-zinc-900' : 'bg-white dark:bg-zinc-900/50'} border-b border-zinc-100 dark:border-zinc-800 last:border-0`}>
                          <td className="py-2.5 px-4 font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap w-1/3">
                            {displayAmount}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-800 dark:text-zinc-200">
                            {displayName}
                            {displayDetails ? <span className="text-zinc-500 dark:text-zinc-400">, {displayDetails}</span> : ''}
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
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                        Per serving {scale !== 1 ? `(scaled ×${scale.toFixed(2)})` : ''}
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Calories', value: fmt(n.calories), unit: 'kcal', color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' },
                          { label: 'Protein', value: fmt(n.protein_g), unit: 'g', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
                          { label: 'Carbs', value: fmt(n.carbs_g), unit: 'g', color: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400' },
                          { label: 'Fat', value: fmt(n.fat_g), unit: 'g', color: 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400' },
                        ].map((stat) => (
                          <div key={stat.label} className={`rounded-xl p-2.5 text-center border border-transparent ${stat.color}`}>
                            <div className="text-lg font-extrabold">{stat.value}<span className="text-xs font-medium ml-0.5">{stat.unit}</span></div>
                            <div className="text-[10px] uppercase tracking-widest font-bold opacity-70 mt-0.5">{stat.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="md:col-span-3">
                <h3 className="text-lg font-bold mb-4">Instructions</h3>
                <ol className="space-y-4">
                  {steps.map((step, i) => (
                    <li key={i} className="flex gap-4">
                      <span className="shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold mt-0.5">{i + 1}</span>
                      <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        {step.replace(/^step\s*\d+[.:)]\s*/i, '')}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Tags */}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Tags</span>
                <button
                  onClick={() => setShowTagEditor((v) => !v)}
                  className={`p-1 rounded-md transition-colors ${showTagEditor ? 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                  title="Edit tags"
                ><Pencil className="w-3 h-3" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(recipe.tags || []).map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 text-orange-600 dark:text-orange-400">
                    {tag}
                    {showTagEditor && (
                      <button
                        onClick={() => onUpdateRecipe(recipe.id, { tags: recipe.tags.filter((t) => t !== tag) })}
                        className="ml-0.5 hover:text-red-500 transition-colors"
                      ><X className="w-2.5 h-2.5" /></button>
                    )}
                  </span>
                ))}
                {recipe.tags?.length === 0 && !showTagEditor && (
                  <span className="text-xs text-zinc-400">No tags yet — use ⋯ to regenerate</span>
                )}
              </div>
              {showTagEditor && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {AVAILABLE_TAGS.filter((t) => !(recipe.tags || []).includes(t)).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => onUpdateRecipe(recipe.id, { tags: [...(recipe.tags || []), tag] })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-400 dark:text-zinc-500 hover:border-orange-400 hover:text-orange-500 transition-colors"
                    >
                      <Plus className="w-2.5 h-2.5" />{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Rating & Notes */}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Your Rating:</span>
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
                      <Star className={`w-6 h-6 ${star <= (recipe.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-300 dark:text-zinc-600'}`} />
                    </button>
                  ))}
                </div>
                {recipe.rating && <span className="text-xs text-zinc-400 font-medium">Click again to remove</span>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Personal Notes</label>
                <textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  onBlur={() => onUpdateRecipe(recipe.id, { notes: notesValue })}
                  placeholder="e.g. Add more garlic next time, great with crusty bread..."
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-400/60 min-h-[70px] resize-none"
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
  );
}
