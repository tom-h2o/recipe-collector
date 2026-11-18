-- Let an owner throw away a translation they no longer want.
--
-- recipe_translations had a select policy and nothing else, so a delete from
-- the browser matched zero rows and PostgREST returned no error — the row
-- stayed and the UI would have reported success. That is the same silent-write
-- trap recorded in CLAUDE.md for recipes, and the reason the client checks the
-- affected rows rather than trusting the absence of an error.
--
-- Owner only, deliberately. A linked account may read the recipe and its
-- translations, but linked recipes are read-only everywhere else in the app,
-- and deleting someone else's cached translation would make them pay for it
-- again the next time they opened the recipe.

drop policy if exists "translations_delete" on public.recipe_translations;
create policy "translations_delete"
  on public.recipe_translations for delete
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_translations.recipe_id
        and r.user_id = auth.uid()
    )
  );
