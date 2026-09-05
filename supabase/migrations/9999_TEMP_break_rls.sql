-- TEMPORARY: deliberately loosen the recipes read policy to prove the RLS suite
-- actually catches an over-permissive policy. Removed in the next commit.
drop policy if exists "recipes_select" on public.recipes;
create policy "recipes_select" on public.recipes for select to authenticated using (true);
