alter table public.recipes
  add column if not exists source_url text,
  add column if not exists source_name text;
