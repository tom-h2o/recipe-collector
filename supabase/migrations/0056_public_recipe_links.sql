-- Public, opt-in, revocable share links for a single recipe.
--
-- Background: /recipe/:id and PublicRecipe.tsx have existed since early on, from
-- the days when 0001 granted `select using (true)`. 0040 and 0049 narrowed
-- recipes_select to `to authenticated`, which left the page intact and the
-- access gone: an anonymous visitor read zero rows and fell through to the
-- login screen, while "Copy share link" in RecipeDetail kept promising
-- otherwise. This restores the feature deliberately rather than by widening
-- recipes_select again.
--
-- Three choices worth keeping in mind before changing any of this:
--
--  1. The token is the secret, NOT the recipe id. Recipe ids are not treated as
--     secrets anywhere else (they sit in URLs, logs and the admin panel), so
--     keying a public read on the id would make every recipe world-readable to
--     anyone holding one, with no opt-in and no way to take it back. A null
--     token means "not shared"; nulls are distinct under a unique index, so
--     every unshared recipe can hold one.
--
--  2. `anon` reaches no row of `recipes` on its own. Supabase grants `anon`
--     SELECT on public tables as part of its standard setup, so what holds it
--     out is RLS: every policy on recipes is `to authenticated`, none applies
--     to anon, and row-level security denies by default. The one way through
--     is this security definer function, which returns exactly one recipe for
--     a valid token. That keeps the blast radius at one row and avoids a
--     second policy on recipes that a future change could widen by accident.
--
--  3. The function returns an explicit column list. `select *` would hand a
--     public page `notes` (the owner's private notes), `user_id`, `rating` and
--     the 768-float `embedding`. Any column added to recipes is private here
--     until someone adds it below on purpose.

alter table public.recipes
  add column if not exists public_share_token uuid;

-- Unique so a token identifies one recipe; partial so unshared rows cost nothing.
create unique index if not exists recipes_public_share_token_key
  on public.recipes (public_share_token)
  where public_share_token is not null;

comment on column public.recipes.public_share_token is
  'Random token for a public share link, or null when the recipe is not shared. Revoke by setting it back to null.';

-- Owners mint and revoke the token through the existing owner-only
-- recipes_update policy, so no new write policy is needed.

create or replace function public.get_shared_recipe(p_token uuid)
returns table (
  id uuid,
  title text,
  description text,
  ingredients jsonb,
  instructions text,
  image_url text,
  servings integer,
  tags text[],
  nutrition jsonb,
  prep_time_mins integer,
  cook_time_mins integer,
  source_url text,
  source_name text,
  original_servings integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.title,
    r.description,
    r.ingredients,
    r.instructions,
    r.image_url,
    r.servings,
    r.tags,
    r.nutrition,
    r.prep_time_mins,
    r.cook_time_mins,
    r.source_url,
    r.source_name,
    r.original_servings,
    r.created_at
  from public.recipes r
  where r.public_share_token = p_token
    and p_token is not null
  limit 1;
$$;

-- A null token must never match a row, or revoking would publish every
-- unshared recipe to anyone calling with null. The `p_token is not null` guard
-- above is belt-and-braces next to the `= p_token` comparison, which is
-- already null-safe; both are kept because the cost is zero and the failure
-- mode is total.

revoke all on function public.get_shared_recipe(uuid) from public;
grant execute on function public.get_shared_recipe(uuid) to anon, authenticated;
