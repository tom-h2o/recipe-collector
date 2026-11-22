import { useState } from 'react';
import { TagIcon, tagClass, tagLabel } from '@/lib/tags';
import { Star, Users, Loader2, Clock, ExternalLink, Share2 } from 'lucide-react';
import { parseIngredients } from '@/lib/recipeUtils';
import type { Recipe } from '@/types';

interface Props {
  recipe: Recipe;
  isProcessing: boolean;
  /** Sent from the iPhone Shortcut and not opened yet. */
  isNew?: boolean;
  /** Filter chips in use, so a tag that is one of them shows as pressed. */
  activeFilters: readonly string[];
  translation?: { title: string; description: string | null; ingredients?: Array<{ amount: string; name: string; details?: string }> } | null;
  translationLoading?: boolean;
  onOpen: (r: Recipe) => void;
  onToggleFavourite: (r: Recipe, e: React.MouseEvent) => void;
  onFilterChange: (tag: string) => void;
}

export function RecipeCard({ recipe, isProcessing, isNew = false, activeFilters, translation, translationLoading, onOpen, onToggleFavourite, onFilterChange }: Props) {
  const parsed = translation?.ingredients ? translation.ingredients : parseIngredients(recipe.ingredients);
  const [imgError, setImgError] = useState(false);
  const totalTime = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);

  return (
    <div
      onClick={() => onOpen(recipe)}
      data-pressable="surface"
      className="recipe-card cursor-pointer overflow-hidden flex flex-col group rounded-xl bg-white dark:bg-card transition-shadow duration-300"
    >
      {/* Image — 40% of card height */}
      <div className="aspect-[4/3] w-full overflow-hidden bg-sk-surface-low dark:bg-muted relative rounded-xl">
        {recipe.image_url && !imgError ? (
          <img
            src={recipe.image_url}
            loading="lazy"
            decoding="async"
            alt={recipe.title}
            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-sk-primary-fixed to-sk-surface-low dark:from-muted dark:to-muted">
            <span className="text-6xl font-serif font-normal text-sk-primary/30 dark:text-primary/20 select-none">
              {recipe.title?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
          <span className="font-sans text-white text-sm font-semibold px-4 py-1.5 rounded-full border border-white/30 bg-white/15 backdrop-blur-sm">
            View Recipe
          </span>
        </div>
        {/* Favourite button */}
        <button
          onClick={(e) => onToggleFavourite(recipe, e)}
          className="absolute top-2 right-2 p-2 rounded-full glass glass-control transition-transform hover:scale-110"
          title={recipe.is_favourite ? 'Unfavourite' : 'Favourite'}
        >
          <Star className={`w-4 h-4 ${recipe.is_favourite ? 'fill-sk-primary text-sk-primary dark:fill-primary dark:text-primary' : 'text-sk-outline dark:text-muted-foreground'}`} />
        </button>
        {/*
          Publicly shared. Without this the only way to find out which recipes
          have a live link is to open each one's menu in turn, which is no way
          to keep track of what you have put on the internet.
        */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {isNew && (
            <div
              title="Sent from your iPhone and not opened yet"
              className="flex items-center gap-1 bg-amber-500/95 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full font-sans"
            >
              New
            </div>
          )}
          {recipe.public_share_token && (
            <div
              title="This recipe has a public link anyone can open"
              className="flex items-center gap-1 bg-sk-primary/90 dark:bg-primary/90 text-white dark:text-primary-foreground text-[10px] font-semibold px-2 py-1 rounded-full font-sans backdrop-blur-sm"
            >
              <Share2 className="w-3 h-3" aria-hidden="true" /> Shared
            </div>
          )}
        </div>
        {/* Processing badge */}
        {(isProcessing || translationLoading) && (
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-1 rounded-full font-sans">
            <Loader2 className="w-3 h-3 animate-spin" />
            {isProcessing ? 'Processing…' : 'Translating…'}
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 px-4 pt-4 pb-3 gap-3">
        {/* Title + description */}
        <div>
          <h3 className="font-serif text-lg font-bold leading-snug line-clamp-1 text-sk-on-surface dark:text-foreground">
            {translation?.title ?? recipe.title}
          </h3>
          <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
            {(translation ? translation.description : recipe.description) || 'No description provided.'}
          </p>
        </div>

        {/* Ingredients: one quiet line of text, "+N more" in the same voice.
            They were grey pills with a green "+N more", which read as a tag. */}
        {parsed.length > 0 && (
          <div>
            <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground mb-1">
              {parsed.length} Ingredient{parsed.length !== 1 ? 's' : ''}
            </p>
            <p className="font-sans text-[13px] leading-relaxed text-sk-on-surface-variant dark:text-muted-foreground line-clamp-2">
              {parsed.slice(0, 5).map((ing) => ing.name).join(' · ')}
              {parsed.length > 5 && <span className="text-sk-outline dark:text-muted-foreground/80"> · +{parsed.length - 5} more</span>}
            </p>
          </div>
        )}

        {/* Tags: small labels; tapping one filters the vault by it. */}
        {recipe.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-auto">
            {recipe.tags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={(e) => { e.stopPropagation(); onFilterChange(tag); }}
                  aria-pressed={activeFilters.includes(tag)}
                  className={tagClass(activeFilters.includes(tag))}
                >
                  <TagIcon tag={tag} className="w-3 h-3 shrink-0" />
                  {tagLabel(tag)}
                </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer — tonal background, no border */}
      <div className="px-4 py-3 bg-sk-surface-low dark:bg-muted rounded-b-xl flex justify-between items-center">
        <div className="flex items-center gap-3">
          {recipe.servings ? (
            <span className="flex items-center gap-1.5 text-xs font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground">
              <Users className="w-3.5 h-3.5" /> Serves {recipe.servings}
            </span>
          ) : null}
          {totalTime > 0 && (
            <span className="flex items-center gap-1 text-xs font-sans font-semibold text-sk-on-surface-variant dark:text-muted-foreground">
              <Clock className="w-3.5 h-3.5" /> {totalTime}m
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {recipe.source_name && (
            <span className="flex items-center gap-1 text-[10px] font-sans font-semibold text-sk-outline dark:text-muted-foreground max-w-[100px] truncate">
              <ExternalLink className="w-3 h-3 shrink-0" />
              {recipe.source_name}
            </span>
          )}
          <p className="text-xs font-sans font-semibold text-sk-outline dark:text-muted-foreground">
            {new Date(recipe.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
