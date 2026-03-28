import { useState } from 'react';
import { Star, Users, Loader2, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { parseIngredients } from '@/lib/recipeUtils';
import type { Recipe } from '@/types';

interface Props {
  recipe: Recipe;
  isProcessing: boolean;
  activeFilter: string | null;
  onOpen: (r: Recipe) => void;
  onToggleFavourite: (r: Recipe, e: React.MouseEvent) => void;
  onFilterChange: (tag: string) => void;
}

export function RecipeCard({ recipe, isProcessing, activeFilter, onOpen, onToggleFavourite, onFilterChange }: Props) {
  const parsed = parseIngredients(recipe.ingredients);
  const [imgError, setImgError] = useState(false);
  const totalTime = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);

  return (
    <Card
      onClick={() => onOpen(recipe)}
      className="cursor-pointer overflow-hidden flex flex-col group hover:shadow-2xl transition-all duration-300 border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative">
        {recipe.image_url && !imgError ? (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-900/30 dark:to-zinc-800">
            <span className="text-6xl font-black text-orange-300 dark:text-orange-700 select-none">
              {recipe.title?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
          <span className="text-white text-sm font-semibold px-4 py-1.5 rounded-full border border-white/30 bg-white/20 backdrop-blur-sm">
            View Recipe
          </span>
        </div>
        <button
          onClick={(e) => onToggleFavourite(recipe, e)}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm shadow transition-transform hover:scale-110"
          title={recipe.is_favourite ? 'Unfavourite' : 'Favourite'}
        >
          <Star className={`w-4 h-4 ${recipe.is_favourite ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-400'}`} />
        </button>
        {isProcessing && (
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing…
          </div>
        )}
      </div>

      <CardHeader className="pt-5">
        <CardTitle className="line-clamp-1 text-xl font-bold">{recipe.title}</CardTitle>
        <CardDescription className="line-clamp-2 mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {recipe.description || 'No description provided.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 pb-3">
        <h4 className="font-bold text-xs uppercase tracking-wider mb-3 text-zinc-400">
          {parsed.length} Ingredient{parsed.length !== 1 ? 's' : ''}
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {parsed.slice(0, 5).map((ing, i) => (
            <span
              key={i}
              className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800/80 text-xs font-medium rounded-md text-zinc-700 dark:text-zinc-300 max-w-[140px] truncate"
            >
              {ing.name}
            </span>
          ))}
          {parsed.length > 5 && (
            <span className="px-2.5 py-1 bg-orange-50 dark:bg-orange-900/20 text-xs font-medium rounded-md text-orange-600 dark:text-orange-400">
              +{parsed.length - 5} more
            </span>
          )}
        </div>
        {recipe.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                onClick={(e) => { e.stopPropagation(); onFilterChange(tag); }}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer transition-all ${
                  activeFilter === tag
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50 text-orange-600 dark:text-orange-400 hover:bg-orange-100'
                }`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t border-zinc-100 dark:border-zinc-800/50 py-3 bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          {recipe.servings ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
              <Users className="w-3.5 h-3.5" /> Serves {recipe.servings}
            </span>
          ) : null}
          {totalTime > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-zinc-500">
              <Clock className="w-3.5 h-3.5" /> {totalTime}m
            </span>
          )}
        </div>
        <p className="text-xs font-semibold text-zinc-400">
          {new Date(recipe.created_at).toLocaleDateString()}
        </p>
      </CardFooter>
    </Card>
  );
}
