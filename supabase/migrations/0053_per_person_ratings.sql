-- One rating per person per recipe.
--
-- rating lived on the recipe row, so there was exactly one and it belonged to
-- whoever owned the row. For two connected accounts that is the wrong shape:
-- you cannot both rate the same dish, and "I gave it 3, you gave it 5" is the
-- part worth seeing.
create table if not exists public.recipe_ratings (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

-- Reading a recipe's ratings means fetching every row for one recipe_id, which
-- the primary key already serves. This one covers the reverse: "everything I
-- have rated", used when resolving the viewer's own rating.
create index if not exists recipe_ratings_user_idx
  on public.recipe_ratings (user_id);

alter table public.recipe_ratings enable row level security;

-- You see your own ratings and those of people you are linked with. Deliberately
-- not "anyone who rated a recipe I can see": a recipe can outlive a link, and a
-- rating should stop being visible when the connection ends.
drop policy if exists "recipe_ratings_select" on public.recipe_ratings;
create policy "recipe_ratings_select"
  on public.recipe_ratings for select
  to authenticated
  using (
    user_id = auth.uid()
    or user_id in (select public.linked_user_ids(auth.uid()))
  );

-- You may rate any recipe you can read, including a linked account's — that is
-- the whole point. The recipes subquery is evaluated under RLS as the caller, so
-- it resolves to exactly the set recipes_select allows. Writes stay to your own
-- row: user_id is pinned to auth.uid() rather than trusted from the payload.
drop policy if exists "recipe_ratings_insert" on public.recipe_ratings;
create policy "recipe_ratings_insert"
  on public.recipe_ratings for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.recipes r where r.id = recipe_id)
  );

drop policy if exists "recipe_ratings_update" on public.recipe_ratings;
create policy "recipe_ratings_update"
  on public.recipe_ratings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "recipe_ratings_delete" on public.recipe_ratings;
create policy "recipe_ratings_delete"
  on public.recipe_ratings for delete
  to authenticated
  using (user_id = auth.uid());

-- Existing ratings belong to the recipe's owner.
insert into public.recipe_ratings (recipe_id, user_id, rating)
select r.id, r.user_id, r.rating
  from public.recipes r
 where r.rating is not null
   and r.user_id is not null
on conflict (recipe_id, user_id) do nothing;

-- recipes.rating stays as a cache of the OWNER's rating, kept in step by the
-- trigger below. It is not redundant storage for its own sake: the "Highest
-- rated" sort runs server-side inside a paginated query, and moving it to a join
-- across recipe_ratings would change the shape of that query and of the owner
-- filter layered on top. This keeps the sort working untouched while
-- recipe_ratings remains the single source of truth for what anyone rated.
create or replace function public.sync_owner_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_recipe uuid := coalesce(new.recipe_id, old.recipe_id);
  target_user uuid := coalesce(new.user_id, old.user_id);
begin
  -- Only the owner's own rating is mirrored; rating a linked account's recipe
  -- must not overwrite what its owner thinks of it.
  update public.recipes r
     set rating = (
       select nr.rating from public.recipe_ratings nr
        where nr.recipe_id = target_recipe and nr.user_id = r.user_id
     )
   where r.id = target_recipe
     and r.user_id = target_user;
  return null;
end;
$$;

drop trigger if exists recipe_ratings_sync_owner on public.recipe_ratings;
create trigger recipe_ratings_sync_owner
  after insert or update or delete on public.recipe_ratings
  for each row execute function public.sync_owner_rating();
