-- Vault search (migration 0076): what recipes.search_text holds, and that the
-- conditions the app sends (one ILIKE '%word%' per typed word) find what a
-- person expects. The app builds the words in src/lib/searchWords.ts.

create extension if not exists pgtap with schema extensions;

begin;
select plan(24);

insert into auth.users (id, email, instance_id, aud, role)
values ('d1000000-0000-0000-0000-0000000000d1', 'search@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.recipes (id, title, description, tags, ingredients, instructions, user_id)
values
  ('d2000000-0000-0000-0000-000000000001', 'Kartoffelsuppe', 'Cremig und schnell',
   '{Vegetarian,Soup}', '[{"amount":"800 g","name":"Kartoffeln","details":"mehlig"},{"amount":"1","name":"Zwiebel","details":""}]'::jsonb,
   'Kochen.', 'd1000000-0000-0000-0000-0000000000d1'),
  ('d2000000-0000-0000-0000-000000000002', 'Käsespätzle', 'Mit Röstzwiebeln',
   '{Vegetarian}', '[{"amount":"200 g","name":"Bergkäse","details":"gerieben"}]'::jsonb,
   'Schichten.', 'd1000000-0000-0000-0000-0000000000d1'),
  ('d2000000-0000-0000-0000-000000000003', 'Lentil Soup', null,
   '{}', '[{"amount":"200 g","name":"lentils","details":""}]'::jsonb,
   'Simmer.', 'd1000000-0000-0000-0000-0000000000d1');

create function pg_temp.found(variadic words text[]) returns text[]
language sql as $$
  select coalesce(array_agg(r.title order by r.title), '{}')
  from public.recipes r
  where r.user_id = 'd1000000-0000-0000-0000-0000000000d1'
    and not exists (select 1 from unnest(words) w where r.search_text not ilike '%' || w || '%');
$$;

select is(pg_temp.found('kartoffel'), array['Kartoffelsuppe'],
  'a word finds its plural and its compounds ("Kartoffel" -> "Kartoffeln", "Kartoffelsuppe")');
select is(pg_temp.found('kart'), array['Kartoffelsuppe'], 'a half-typed word already finds the recipe');
select is(pg_temp.found('suppe'), array['Kartoffelsuppe'], 'a word inside a longer word is found ("Suppe" in "Kartoffelsuppe")');
select is(pg_temp.found('zwiebel'), array['Kartoffelsuppe', 'Käsespätzle'],
  'an ingredient name and a description both count');
select is(pg_temp.found('zwiebel', 'käse'), array['Käsespätzle'], 'several words must all match');
select is(pg_temp.found('KÄSE'), array['Käsespätzle'], 'case does not matter, for umlauts too');
select is(pg_temp.found('vegetarian'), array['Kartoffelsuppe', 'Käsespätzle'], 'tags are searched');
select is(pg_temp.found('mehlig'), array['Kartoffelsuppe'], 'ingredient details are searched');
select is(pg_temp.found('soup'), array['Kartoffelsuppe', 'Lentil Soup'], 'a tag and a title both match "soup"');

-- The JSON around the ingredients used to be indexed, so "name" matched every
-- recipe. Amounts are left out as well: "200" is not what anyone looks for.
select is(pg_temp.found('name'), '{}'::text[], 'the JSON keys are not searched');
select is(pg_temp.found('details'), '{}'::text[], 'nor "details"');

select is(
  (select btrim(search_text) from public.recipes where id = 'd2000000-0000-0000-0000-000000000003'),
  'Lentil Soup  lentils',
  'a recipe without a description, tags, search words or translations still gets its text');

-- ── Across languages (migration 0080) ────────────────────────────────────────

-- Tags are stored in English; their German names are searched too.
select is(pg_temp.found('vegetarisch'), array['Kartoffelsuppe', 'Käsespätzle'], 'a tag is found by its German name');
select is(pg_temp.found('suppe'), array['Kartoffelsuppe'], 'the German tag name does not match recipes without the tag');
select is(public.tag_search_words(null), null, 'no tags, no words');
select is(public.tag_search_words('{Vegan,"Made up"}'), null, 'a tag whose German name is the same word, or an unknown tag, adds nothing');

-- The AI's German and English search words (written by the tagging call).
select is(pg_temp.found('potatoes'), '{}'::text[], 'before its search words exist, a German recipe is not found in English');
update public.recipes set search_keywords = 'kartoffeln potatoes suppe soup zwiebel onion'
 where id = 'd2000000-0000-0000-0000-000000000001';
select is(pg_temp.found('potatoes'), array['Kartoffelsuppe'], 'with them, "potatoes" finds the recipe with "Kartoffeln"');
select is(pg_temp.found('onion', 'potato'), array['Kartoffelsuppe'], 'and several English words still all have to match');

-- Stored translations: found by their title and ingredients, in any language.
select is(pg_temp.found('lentejas'), '{}'::text[], 'a recipe is not found by a language nobody translated it into');
insert into public.recipe_translations (recipe_id, language_code, title, description, instructions, ingredients)
values ('d2000000-0000-0000-0000-000000000003', 'es', 'Sopa de lentejas', null, 'Cocer a fuego lento.',
        '[{"amount":"200 g","name":"lentejas","details":"rojas"}]'::jsonb);
select is(pg_temp.found('lentejas', 'sopa'), array['Lentil Soup'], 'a stored translation makes it findable in that language');
select is(pg_temp.found('fuego'), '{}'::text[], 'the translated instructions are not searched, like the original ones');

update public.recipe_translations set title = 'Crema de lentejas' where recipe_id = 'd2000000-0000-0000-0000-000000000003';
select is(pg_temp.found('crema'), array['Lentil Soup'], 'a changed translation is searched as changed');

delete from public.recipe_translations where recipe_id = 'd2000000-0000-0000-0000-000000000003';
select is(pg_temp.found('lentejas'), '{}'::text[], 'a deleted translation is no longer searched');

select * from finish();
rollback;
