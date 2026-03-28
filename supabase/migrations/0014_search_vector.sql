-- Full-text search index on recipes
alter table public.recipes
  add column if not exists search_vector tsvector
    generated always as (
      to_tsvector('english',
        coalesce(title, '') || ' ' ||
        coalesce(description, '')
      )
    ) stored;

create index if not exists recipes_search_vector_idx
  on public.recipes using gin(search_vector);
