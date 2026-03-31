-- Store last-used display language per recipe (syncs across devices)
alter table public.recipes
  add column if not exists preferred_language text;
