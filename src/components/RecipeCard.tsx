import { useState } from 'react';
import { Star, Users, Loader2, Clock, ExternalLink } from 'lucide-react';
import { parseIngredients } from '@/lib/recipeUtils';
import type { Recipe } from '@/types';

interface Props {
  recipe: Recipe;
  isProcessing: boolean;
  activeFilter: string | null;
  translation?: { title: string; description: string | null; ingredients?: Array<{ amount: string; name: string; details?: string }> } | null;
  translationLoading?: boolean;
  onOpen: (r: Recipe) => void;
  onToggleFavourite: (r: Recipe, e: React.MouseEvent) => void;
  onFilterChange: (tag: string) => void;
}

export function RecipeCard({ recipe, isProcessing, activeFilter, translation, translationLoading, onOpen, onToggleFavourite, onFilterChange }: Props) {
  const parsed = translation?.ingredients ? translation.ingredients : parseIngredients(recipe.ingredients);
  const [imgError, setImgError] = useState(false);
  const totalTime = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);

  return (
    <div
      onClick={() => onOpen(recipe)}
      className="cursor-pointer overflow-hidden flex flex-col group rounded-xl bg-white dark:bg-card hover:shadow-ambient transition-all duration-300"
      style={{ boxShadow: '0 2px 12px rgba(47, 49, 46, 0.04)' }}
    >
      {/* Image — 40% of card height */}
      <div className="aspect-[4/3] w-full overflow-hidden bg-sk-surface-low dark:bg-muted relative rounded-xl">
        {recipe.image_url && !imgError ? (
          <img
            src={recipe.image_url}
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
        <div className="absolute inset-0 bg-gradient-to-t from-sk-on-surface/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
          <span className="font-sans text-white text-sm font-semibold px-4 py-1.5 rounded-full border border-white/30 bg-white/15 backdrop-blur-sm">
            View Recipe
          </span>
        </div>
        {/* Favourite button */}
        <button
          onClick={(e) => onToggleFavourite(recipe, e)}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-white/85 dark:bg-card/85 backdrop-blur-sm shadow-sm transition-transform hover:scale-110"
          title={recipe.is_favourite ? 'Unfavourite' : 'Favourite'}
        >
          <Star className={`w-4 h-4 ${recipe.is_favourite ? 'fill-sk-primary text-sk-primary dark:fill-primary dark:text-primary' : 'text-sk-outline dark:text-muted-foreground'}`} />
        </button>
        {/* Processing badge */}
        {(isProcessing || translationLoading) && (
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-sk-on-surface/70 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-1 rounded-full font-sans">
            <Loader2 className="w-3 h-3 animate-spin" />
            {isProcessing ? 'Processing…' : 'Translating…'}
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 px-4 pt-4 pb-3 gap-3">
        {/* Title + description */}
        <div>
          <h3 className="font-serif text-lg font-normal leading-snug line-clamp-1 text-sk-on-surface dark:text-foreground">
            {translation?.title ?? recipe.title}
          </h3>
          <p className="font-sans text-sm text-sk-on-surface-variant dark:text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
            {(translation ? translation.description : recipe.description) || 'No description provided.'}
          </p>
        </div>

        {/* Ingredients */}
        <div>
          <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-sk-outline dark:text-muted-foreground mb-2">
            {parsed.length} Ingredient{parsed.length !== 1 ? 's' : ''}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {parsed.slice(0, 5).map((ing, i) => (
              <span
                key={i}
                className="px-2.5 py-0.5 bg-sk-surface-low dark:bg-muted text-xs font-sans font-medium rounded-full text-sk-on-surface-variant dark:text-muted-foreground max-w-[140px] truncate"
              >
                {ing.name}
              </span>
            ))}
            {parsed.length > 5 && (
              <span className="px-2.5 py-0.5 bg-sk-primary-fixed/50 dark:bg-primary/15 text-xs font-sans font-medium rounded-full text-sk-primary dark:text-primary">
                +{parsed.length - 5} more
              </span>
            )}
          </div>
        </div>

        {/* Tags */}
        {recipe.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                onClick={(e) => { e.stopPropagation(); onFilterChange(tag); }}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-sans cursor-pointer transition-all ${
                  activeFilter === tag
                    ? 'bg-sk-primary text-white dark:bg-primary dark:text-primary-foreground'
                    : 'bg-sk-primary-fixed/40 dark:bg-primary/15 text-sk-primary dark:text-primary hover:bg-sk-primary-fixed/70'
                }`}
              >
                {tag}
              </span>
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
