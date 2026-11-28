-- Vault search across languages.
--
-- Since 0076 the vault looks in recipes.search_text, built from the recipe's
-- own title, description, tags and ingredients. A recipe is written in one
-- language and its tags are stored in English, so "eggs" did not find a German
-- recipe with "Eier" (not even one with an English translation stored), and
-- "vegetarisch" did not find the tag Vegetarian.
--
-- Still one column, one trigram index and the same query. Three more sources
-- now feed that column:
--
--   1. recipes.search_keywords: the dish and its ingredients in German and
--      English, written by the AI in the same call that tags the recipe
--      (api/_lib/enrich.ts). Works for every recipe, translated or not.
--   2. recipes.translation_search: title and ingredients of every stored
--      translation, kept by a trigger on recipe_translations. This is what
--      makes a recipe findable in Spanish or French once someone has
--      translated it.
--   3. The German name of each tag, from a fixed list (tag_search_words).
--
-- A generated column can only read its own row, which is why the translations
-- are copied onto the recipe rather than joined at search time: the search
-- stays a single indexed ILIKE per typed word however many languages exist.

alter table public.recipes
  add column if not exists search_keywords text,
  add column if not exists translation_search text;

comment on column public.recipes.search_keywords is
  'Search words for the dish and its ingredients in German and English, written by the AI when the recipe is tagged. Feeds search_text; never shown.';
comment on column public.recipes.translation_search is
  'Title and ingredient names of every stored translation of this recipe. Maintained by a trigger on recipe_translations. Feeds search_text; never shown.';

-- The German names of the tags (src/i18n/de). Tags are stored in English.
-- tests/unit/tagList.test.ts fails when a tag has a German name the app shows
-- and this list does not carry.
create or replace function public.tag_search_words(p_tags text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select string_agg(w.de, ' ')
  from unnest(coalesce(p_tags, '{}'::text[])) as t(tag)
  join (values
    ('Vegetarian', 'Vegetarisch'),
    ('Gluten-Free', 'Glutenfrei'),
    ('Dairy-Free', 'Milchfrei laktosefrei'),
    ('High Protein', 'Proteinreich eiweißreich'),
    ('German', 'Deutsch'),
    ('Italian', 'Italienisch'),
    ('Mediterranean', 'Mediterran'),
    ('Asian', 'Asiatisch'),
    ('Indian', 'Indisch'),
    ('Mexican', 'Mexikanisch'),
    ('American', 'Amerikanisch'),
    ('Breakfast', 'Frühstück'),
    ('Lunch', 'Mittagessen'),
    ('Dinner', 'Abendessen'),
    ('Dessert', 'Nachtisch'),
    ('Soup', 'Suppe'),
    ('Salad', 'Salat'),
    ('Pasta', 'Nudeln'),
    ('Casserole', 'Auflauf'),
    ('Chicken', 'Hähnchen Huhn Geflügel'),
    ('Meat', 'Fleisch'),
    ('Fish & Seafood', 'Fisch Meeresfrüchte'),
    ('Quick (<30min)', 'Schnell unter 30 Minuten'),
    ('Baking', 'Backen'),
    ('Grilling', 'Grillen'),
    ('Comfort Food', 'Soulfood')
  ) as w(tag, de) on w.tag = t.tag;
$$;

comment on function public.tag_search_words(text[]) is
  'German search words for a recipe''s (English) tags. Feeds recipes.search_text.';

-- Title and ingredient names of one translation, as searchable text.
create or replace function public.translation_search_text(p_title text, p_ingredients jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select concat_ws(' ',
    p_title,
    (
      select string_agg(concat_ws(' ', i ->> 'name', i ->> 'details'), ' ')
      from jsonb_array_elements(
        case when jsonb_typeof(p_ingredients) = 'array' then p_ingredients else '[]'::jsonb end
      ) as i
    )
  );
$$;

-- Keeps recipes.translation_search equal to what recipe_translations holds.
-- Security definer: a translation is stored by the server, but deleted from
-- the browser by anyone who may (0064), and that person need not be allowed to
-- update the recipe row itself.
create or replace function public.sync_translation_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe uuid := coalesce(new.recipe_id, old.recipe_id);
begin
  update public.recipes r
     set translation_search = (
       select string_agg(public.translation_search_text(t.title, t.ingredients), ' ' order by t.language_code)
       from public.recipe_translations t
       where t.recipe_id = v_recipe
     )
   where r.id = v_recipe;
  return null;
end;
$$;

revoke all on function public.sync_translation_search() from public, anon, authenticated;

drop trigger if exists recipe_translations_search on public.recipe_translations;
create trigger recipe_translations_search
  after insert or update or delete on public.recipe_translations
  for each row execute function public.sync_translation_search();

-- Translations stored before this migration.
update public.recipes r
   set translation_search = s.txt
  from (
    select t.recipe_id,
           string_agg(public.translation_search_text(t.title, t.ingredients), ' ' order by t.language_code) as txt
    from public.recipe_translations t
    group by t.recipe_id
  ) s
 where s.recipe_id = r.id;

-- The searched column with its new sources. Dropped and added rather than
-- altered in place (ALTER COLUMN ... SET EXPRESSION needs Postgres 17); the
-- name stays, so a browser on the previous build keeps searching.
drop index if exists public.recipes_search_text_trgm_idx;
alter table public.recipes drop column if exists search_text;
alter table public.recipes
  add column search_text text
  generated always as (
    public.recipe_search_text(title, description, tags, ingredients)
    || ' ' || coalesce(public.tag_search_words(tags), '')
    || ' ' || coalesce(search_keywords, '')
    || ' ' || coalesce(translation_search, '')
  ) stored;

comment on column public.recipes.search_text is
  'Generated. The recipe''s own text, its tags'' German names, the AI''s German/English search words and its stored translations. Searched by the vault with ILIKE, one condition per typed word (src/lib/searchWords.ts).';

create index if not exists recipes_search_text_trgm_idx
  on public.recipes using gin (search_text extensions.gin_trgm_ops);
