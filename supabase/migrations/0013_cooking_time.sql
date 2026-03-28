-- Add prep and cook time columns to recipes
alter table public.recipes
  add column if not exists prep_time_mins integer,
  add column if not exists cook_time_mins integer;
