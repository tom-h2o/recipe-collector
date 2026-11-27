-- Vault search that finds German, half-typed words, several words, and words
-- inside words.
--
-- Until now the vault searched recipes.search_vector (0028): Postgres full-text
-- search with the English configuration over title, description and
-- ingredients::text. For a vault of mostly German recipes that meant:
--   * "Kartoffel" did not find "Kartoffeln" (English stemming), nor
--     "Kartoffelsuppe" (whole words only), and nothing matched a half-typed word;
--   * two words were a tsquery syntax error, which the app swallowed, so the
--     list silently kept the previous result;
--   * tags were not searched, while the JSON keys "name", "amount" and "details"
--     were, in every recipe.
--
-- Now there is one plain-text column holding what a person would search for,
-- and the app asks for each typed word anywhere in it (ILIKE '%word%', all
-- words must match). A trigram index keeps that fast as the vault grows. No
-- language configuration is involved, so it behaves the same for German,
-- English and Polish.
--
-- recipes.search_vector is left in place: a browser still running the previous
-- build (the service worker keeps one) queries it until it reloads. Nothing in
-- the current code reads it; a later migration can drop it.

create extension if not exists pg_trgm with schema extensions;

-- What is searched: title, description, tags, and each ingredient's name and
-- details (not its amount, and not the JSON around it).
--
-- Declared immutable because a generated column requires it. It is: the result
-- depends only on the arguments.
create or replace function public.recipe_search_text(
  p_title text,
  p_description text,
  p_tags text[],
  p_ingredients jsonb
) returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select concat_ws(' ',
    p_title,
    p_description,
    array_to_string(p_tags, ' '),
    (
      select string_agg(concat_ws(' ', i ->> 'name', i ->> 'details'), ' ')
      from jsonb_array_elements(
        case when jsonb_typeof(p_ingredients) = 'array' then p_ingredients else '[]'::jsonb end
      ) as i
    )
  );
$$;

comment on function public.recipe_search_text(text, text, text[], jsonb) is
  'The text the vault search looks in: title, description, tags, ingredient names and details. Feeds recipes.search_text.';

alter table public.recipes
  add column if not exists search_text text
  generated always as (public.recipe_search_text(title, description, tags, ingredients)) stored;

comment on column public.recipes.search_text is
  'Generated. Searched by the vault with ILIKE, one condition per typed word (src/lib/searchWords.ts).';

create index if not exists recipes_search_text_trgm_idx
  on public.recipes using gin (search_text extensions.gin_trgm_ops);
