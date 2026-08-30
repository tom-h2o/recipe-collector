-- Linked accounts: see another person's recipes without them sending each one.
--
-- Push sharing already exists (recipe_shares copies a recipe on accept). This is
-- the pull side: a standing, mutual link that makes a person's whole vault
-- readable. Read only — every write policy still requires ownership, so a linked
-- recipe cannot be edited, favourited or rated by the other party.

create table if not exists public.account_links (
  id uuid primary key default gen_random_uuid(),

  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_email text not null,
  -- Invited by address so someone can be invited before they have an account.
  addressee_email text not null,
  -- Filled in when the invitation is accepted.
  addressee_id uuid references auth.users(id) on delete cascade,

  status text not null default 'pending' check (status in ('pending', 'accepted')),

  -- What each side calls the other, shown on the vault filter chips. Each label
  -- is set by the person who chose it, and falls back to the email until then.
  requester_label text,
  addressee_label text,

  created_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,

  -- one link per pair, in one direction
  unique (requester_id, addressee_email)
);

create index if not exists account_links_requester_idx
  on public.account_links (requester_id, status);
create index if not exists account_links_addressee_idx
  on public.account_links (addressee_id, status);
create index if not exists account_links_addressee_email_idx
  on public.account_links (addressee_email, status);

alter table public.account_links enable row level security;

-- Either side can see the link; the invitee is matched by address until they
-- have accepted and their id is known.
create policy "account_links_select"
  on public.account_links for select
  to authenticated
  using (
    auth.uid() = requester_id
    or auth.uid() = addressee_id
    or lower(addressee_email) = lower(auth.email())
  );

create policy "account_links_insert"
  on public.account_links for insert
  to authenticated
  with check (auth.uid() = requester_id);

-- Accepting, renaming and disconnecting are all updates or deletes by a party.
create policy "account_links_update"
  on public.account_links for update
  to authenticated
  using (
    auth.uid() = requester_id
    or auth.uid() = addressee_id
    or lower(addressee_email) = lower(auth.email())
  )
  with check (
    auth.uid() = requester_id
    or auth.uid() = addressee_id
    or lower(addressee_email) = lower(auth.email())
  );

create policy "account_links_delete"
  on public.account_links for delete
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- The ids whose recipes the caller may read.
--
-- SECURITY DEFINER on purpose. Called from the recipes policy below, a plain
-- subquery would itself be evaluated under RLS as the caller and could come back
-- empty — partner recipes would silently not appear, with no error to explain
-- why. Marked STABLE so the planner can cache it per statement.
create or replace function public.linked_user_ids(for_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when l.requester_id = for_user then l.addressee_id
              else l.requester_id end
  from public.account_links l
  where l.status = 'accepted'
    and (l.requester_id = for_user or l.addressee_id = for_user)
$$;

revoke all on function public.linked_user_ids(uuid) from public;
grant execute on function public.linked_user_ids(uuid) to authenticated;

-- Recipes: own, or belonging to someone linked. Writes are untouched, which is
-- what makes linked recipes read-only without any extra checks in the app.
drop policy if exists "recipes_select" on public.recipes;
create policy "recipes_select"
  on public.recipes for select
  to authenticated
  using (
    auth.uid() = user_id
    or user_id in (select public.linked_user_ids(auth.uid()))
  );

-- Photos and translations follow the recipe, otherwise a linked recipe would
-- render with no gallery and no translations.
drop policy if exists "recipe_images_select" on public.recipe_images;
create policy "recipe_images_select"
  on public.recipe_images for select
  to authenticated
  using (
    auth.uid() = user_id
    or user_id in (select public.linked_user_ids(auth.uid()))
  );

drop policy if exists "translations_select" on public.recipe_translations;
create policy "translations_select"
  on public.recipe_translations for select
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_translations.recipe_id
        and (
          r.user_id = auth.uid()
          or r.user_id in (select public.linked_user_ids(auth.uid()))
        )
    )
  );

-- Adopting a linked recipe copies it. Recording where it came from lets the
-- original drop out of the linked list, so the same dish is not listed twice.
-- Set null rather than cascade: losing the original must not delete your copy.
alter table public.recipes
  add column if not exists copied_from_recipe_id uuid
  references public.recipes(id) on delete set null;

create index if not exists recipes_copied_from_idx
  on public.recipes (user_id, copied_from_recipe_id)
  where copied_from_recipe_id is not null;

-- Ingredient search ("what can I cook?") does not go through RLS — it filters
-- explicitly on one user id. Left alone it would keep searching only the
-- caller's own vault while the rest of the app shows both, which fails quietly
-- rather than loudly. Widened to the same set the recipes policy allows.
create or replace function public.match_recipes(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_user_id uuid
)
returns table (
  id uuid,
  title varchar,
  description text,
  ingredients jsonb,
  similarity float
)
language plpgsql
stable
as $$
begin
  return query
  select
    recipes.id,
    recipes.title,
    recipes.description,
    recipes.ingredients,
    1 - (recipes.embedding <=> query_embedding) as similarity
  from recipes
  where (
      recipes.user_id = filter_user_id
      or recipes.user_id in (select public.linked_user_ids(filter_user_id))
    )
    and recipes.embedding is not null
    and 1 - (recipes.embedding <=> query_embedding) > match_threshold
  order by recipes.embedding <=> query_embedding
  limit match_count;
end;
$$;
