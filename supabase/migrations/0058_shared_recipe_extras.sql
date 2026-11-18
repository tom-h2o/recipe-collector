-- The photo gallery and the cached translations of a publicly shared recipe.
--
-- Same three rules as get_shared_recipe (migration 0056), for the same reasons:
-- the token is the only key, `anon` reaches no row of these tables on its own
-- (their policies are all `to authenticated`, so RLS denies it by default --
-- note that anon does hold Supabase's standard SELECT grant, so the grant is
-- not what protects them), and every column is named rather than selected
-- with *.
--
-- Translations are free to hand out: they are already in recipe_translations,
-- put there by the owner. Nothing here can cause an AI call — the guest page
-- has no path to /api/translate, which requires a Bearer token and is rate
-- limited per user. A guest can read a translation that exists and cannot
-- cause one to be made.

create or replace function public.get_shared_recipe_images(p_token uuid)
returns table (
  url text,
  source text,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.url, i.source, i.sort_order
    from public.recipe_images i
    join public.recipes r on r.id = i.recipe_id
   where r.public_share_token = p_token
     and p_token is not null
   order by i.sort_order, i.created_at;
$$;

create or replace function public.get_shared_recipe_translations(p_token uuid)
returns table (
  language_code text,
  title text,
  description text,
  instructions text,
  ingredients jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.language_code, t.title, t.description, t.instructions, t.ingredients
    from public.recipe_translations t
    join public.recipes r on r.id = t.recipe_id
   where r.public_share_token = p_token
     and p_token is not null
   order by t.language_code;
$$;

revoke all on function public.get_shared_recipe_images(uuid) from public;
revoke all on function public.get_shared_recipe_translations(uuid) from public;
grant execute on function public.get_shared_recipe_images(uuid) to anon, authenticated;
grant execute on function public.get_shared_recipe_translations(uuid) to anon, authenticated;
