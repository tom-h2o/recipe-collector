-- Extend search_vector to include ingredients for full-text search
-- This allows searching by ingredient names in addition to title/description

-- Drop the existing generated column
alter table public.recipes drop column search_vector;

-- Recreate it with ingredients included
alter table public.recipes add column search_vector tsvector generated always as (
  to_tsvector('english',
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(ingredients::text, '')
  )
) stored;

-- Recreate the index
create index recipes_search_vector_idx on public.recipes using gin (search_vector);
