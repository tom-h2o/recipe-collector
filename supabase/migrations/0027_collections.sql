-- Collections (folders) for organising recipes

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

alter table public.collections enable row level security;

create policy "collections_owner"
  on public.collections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Join table: which recipes are in which collection
create table public.recipe_collections (
  collection_id uuid references public.collections(id) on delete cascade not null,
  recipe_id uuid not null,
  added_at timestamptz default now(),
  primary key (collection_id, recipe_id)
);

alter table public.recipe_collections enable row level security;

-- Only the collection owner can read/write memberships
create policy "recipe_collections_owner"
  on public.recipe_collections for all
  using (
    exists (
      select 1 from public.collections c
      where c.id = recipe_collections.collection_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.collections c
      where c.id = recipe_collections.collection_id
        and c.user_id = auth.uid()
    )
  );
