import { supabase } from '@/lib/supabase';

/**
 * Copies a linked account's recipe into your own vault, recording where it came
 * from so the original drops out of your linked list rather than appearing twice.
 * Translations come along, matching what accepting a shared recipe already does.
 */
export async function adoptRecipe(recipe: Record<string, unknown>, userId: string): Promise<string> {
  const originalId = recipe.id as string;

  const { data: existing } = await supabase
    .from('recipes')
    .select('id')
    .eq('user_id', userId)
    .eq('copied_from_recipe_id', originalId)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: copy, error } = await supabase
    .from('recipes')
    .insert({
      title: recipe.title,
      description: recipe.description,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      image_url: recipe.image_url,
      servings: recipe.servings,
      original_servings: recipe.original_servings,
      prep_time_mins: recipe.prep_time_mins,
      cook_time_mins: recipe.cook_time_mins,
      tags: recipe.tags,
      nutrition: recipe.nutrition,
      source_url: recipe.source_url,
      source_name: recipe.source_name,
      original_language: recipe.original_language,
      user_id: userId,
      copied_from_recipe_id: originalId,
    })
    .select('id')
    .single();
  if (error || !copy) throw new Error(error?.message ?? 'Could not save the recipe.');

  const { data: translations } = await supabase.from('recipe_translations').select('*').eq('recipe_id', originalId);
  if (translations && translations.length > 0) {
    await supabase.from('recipe_translations').insert(
      translations.map((t: Record<string, unknown>) => ({
        recipe_id: copy.id,
        language_code: t.language_code,
        title: t.title,
        description: t.description,
        ingredients: t.ingredients,
        instructions: t.instructions,
      })),
    );
  }

  return copy.id as string;
}
