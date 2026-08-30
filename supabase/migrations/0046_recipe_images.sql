-- Gallery of images per recipe.
--
-- A recipe previously had one image_url and nothing else. Photos uploaded for
-- extraction were sent to Gemini and discarded, so a multi-page scan kept only
-- its first page and a user could never see what they had photographed.
--
-- recipes.image_url stays as the denormalised cover so the paginated vault
-- query is unchanged; this table holds every image the recipe has ever had.
-- Setting a cover repoints image_url and removes nothing.

create table if not exists public.recipe_images (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  -- set for files we hold in the recipe-images bucket, null for external URLs
  storage_path text,
  -- where the picture came from, surfaced as a badge in the gallery
  source text not null default 'upload'
    check (source in ('upload', 'website', 'stock')),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists recipe_images_recipe_idx
  on public.recipe_images (recipe_id, sort_order, created_at);

alter table public.recipe_images enable row level security;

create policy "recipe_images_select"
  on public.recipe_images for select
  using (auth.uid() = user_id);

create policy "recipe_images_insert"
  on public.recipe_images for insert
  with check (auth.uid() = user_id);

create policy "recipe_images_update"
  on public.recipe_images for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "recipe_images_delete"
  on public.recipe_images for delete
  using (auth.uid() = user_id);

-- Seed the gallery with the image each recipe already shows, so existing
-- recipes are not empty and replacing a cover still keeps the old picture.
-- Source is inferred from the URL: our own storage means it was uploaded,
-- Unsplash means the automatic stock lookup, anything else came from the
-- source website (og:image during extraction).
insert into public.recipe_images (recipe_id, user_id, url, storage_path, source, sort_order)
select
  r.id,
  r.user_id,
  r.image_url,
  case when r.image_url like '%/storage/v1/object/public/recipe-images/%'
       then split_part(r.image_url, '/recipe-images/', 2) end,
  case
    when r.image_url like '%/storage/v1/object/public/recipe-images/%' then 'upload'
    when r.image_url like '%unsplash.com%' then 'stock'
    else 'website'
  end,
  0
from public.recipes r
where r.user_id is not null
  and coalesce(r.image_url, '') <> ''
  and not exists (
    select 1 from public.recipe_images ri where ri.recipe_id = r.id
  );
