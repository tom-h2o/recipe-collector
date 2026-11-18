-- Polish is no longer one of the offered languages.
--
-- Removing it from LANGUAGES only changes the picker. Two kinds of row would
-- have been left behind:
--
--  1. Cached translations in recipe_translations. Harmless but dead — nothing
--     can ask for them once 'pl' is gone from the translate schema's enum.
--
--  2. recipes.preferred_language = 'pl'. This is the one that mattered: that
--     column is what RecipeDetail renders a recipe in, so such a recipe would
--     keep displaying in Polish with no entry left in the picker to switch it
--     back. Nulling it means "show the original", which is the same state a
--     recipe has before anyone picks a language.
--
-- recipes.original_language is deliberately NOT touched. That records what
-- language a recipe was actually written in, which is a fact about the recipe
-- and stays true whether or not we offer to translate into it.

delete from public.recipe_translations
 where language_code = 'pl';

update public.recipes
   set preferred_language = null
 where preferred_language = 'pl';
